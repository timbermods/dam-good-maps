using System;
using System.IO;
using Timberborn.CoreUI;
using Timberborn.GameSceneLoading;
using Timberborn.MapRepositorySystem;
using Timberborn.NewGameConfigurationSystem;
using Timberborn.SceneLoading;
using Timberborn.SingletonSystem;
using UnityEngine;
using UnityEngine.InputSystem;

namespace DGMCompanion
{
    // In a game: remembers the faction and difficulty of a new game (for the menu entry), and on the reload
    // key starts the map over when its file was saved again since this game started.
    public class GameCompanion : IPostLoadableSingleton, IUpdatableSingleton
    {
        private readonly ISceneLoader _sceneLoader;
        private readonly GameSceneLoader _gameSceneLoader;
        private readonly MapRepository _mapRepository;
        private readonly DialogBoxShower _dialogBoxShower;

        private NewGameConfiguration _config;
        private string _mapPath;
        private MapFileWatch.Stamp _stamp;
        private KeyChord _chord;
        private Key _key;
        private bool _dialogOpen;

        // The newest dialog and what it says (the in-game test answers it).
        public static DialogBox LastDialog { get; private set; }
        public static string LastMessage { get; private set; }
        public static Action LastConfirm { get; private set; }
        public static int KeyPresses { get; private set; }
        public static string MapPath { get; private set; }
        public static string Faction { get; private set; }
        public static string Mode { get; private set; }
        public static GameCompanion Current { get; private set; }

        public GameCompanion(ISceneLoader sceneLoader, GameSceneLoader gameSceneLoader, MapRepository mapRepository, DialogBoxShower dialogBoxShower)
        {
            _sceneLoader = sceneLoader;
            _gameSceneLoader = gameSceneLoader;
            _mapRepository = mapRepository;
            _dialogBoxShower = dialogBoxShower;
        }

        public void PostLoad()
        {
            Current = this;
            try
            {
                if (!_sceneLoader.TryGetSceneParameters(out GameSceneParameters parameters) || !parameters.NewGame)
                {
                    return;
                }
                _config = parameters.NewGameConfiguration;
                CompanionSettings settings = CompanionEnv.LoadSettings();
                if (!IsProbeRun())
                {
                    Remember(settings);
                }
                LoadChord(settings);
                // The reload key is for Dam Good Maps' own files; another map is left alone.
                if (!_config.MapFileReference.Resource)
                {
                    string path = _mapRepository.CustomMapNameToFileName(_config.MapFileReference);
                    if (LatestMap.IsDamGoodMapsFile(path))
                    {
                        _mapPath = path;
                        _stamp = MapFileWatch.Take(_mapPath);
                    }
                }
                MapPath = _mapPath;
                Faction = _config.FactionId;
                Mode = ModeSnapshot.NamedMode(_config.GameMode) ?? "custom";
                CompanionEnv.Log($"new game on {(_mapPath ?? _config.MapFileReference.Name)}; reload key {(_chord == null ? "off" : _chord.ToString())}");
            }
            catch (Exception e)
            {
                CompanionEnv.Warn("could not set up the game companion: " + e);
            }
        }

        // The DGM Probe plays maps with forced weather and no player: its games are not the player's choice.
        private static bool IsProbeRun() => Array.IndexOf(Environment.GetCommandLineArgs(), "-dgmprobe") >= 0;

        private void Remember(CompanionSettings settings)
        {
            if (settings.Damaged)
            {
                CompanionEnv.Warn(CompanionEnv.SettingsFile + " is not readable JSON; it is left as it is and nothing is remembered.");
                return;
            }
            string mode = ModeSnapshot.NamedMode(_config.GameMode);
            settings.Faction = _config.FactionId;
            settings.Mode = mode;
            settings.CustomMode = mode == null ? ModeSnapshot.ToNumbers(_config.GameMode) : null;
            if (!settings.TrySave(CompanionEnv.SettingsFile))
            {
                CompanionEnv.Warn("could not save " + CompanionEnv.SettingsFile + "; the next menu start uses the earlier choice.");
            }
        }

        private void LoadChord(CompanionSettings settings)
        {
            if (KeyChord.TryParse(settings.ReloadKey, out KeyChord chord) && Enum.TryParse(chord.Key, true, out Key key))
            {
                _chord = chord;
                _key = key;
            }
            else
            {
                CompanionEnv.Warn("the reload key \"" + settings.ReloadKey + "\" is not a key the game knows; there is no reload key.");
            }
        }

        public void UpdateSingleton()
        {
            if (_chord == null || _mapPath == null)
            {
                return;
            }
            Keyboard keyboard = Keyboard.current;
            if (keyboard == null || !keyboard[_key].wasPressedThisFrame)
            {
                return;
            }
            // (on a Mac the Command key stands for Ctrl)
            bool ctrl = keyboard.ctrlKey.isPressed || keyboard.leftCommandKey.isPressed || keyboard.rightCommandKey.isPressed, shift = keyboard.shiftKey.isPressed, alt = keyboard.altKey.isPressed;
            if (ctrl != _chord.Ctrl || shift != _chord.Shift || alt != _chord.Alt)
            {
                return;
            }
            KeyPresses++;
            OnReloadKey();
        }

        // What the reload key does: nothing if the map's file is as it was, else ask first.
        public void OnReloadKey()
        {
            if (_dialogOpen || _config == null)
            {
                return;
            }
            string name = Path.GetFileNameWithoutExtension(_mapPath);
            // The app never overwrites a map: saving it again makes a new file ("name-2"), so the newest save
            // of the map is looked for in the folder, not only the file this game started on.
            ReloadOffer offer = MapFileWatch.Check(_mapPath, _stamp);
            switch (offer.Change)
            {
                case FileChange.Unchanged:
                    Show($"{name} has not been saved again since this game started.", null);
                    break;
                case FileChange.Missing:
                    Show($"The file of {name} is gone, so it cannot be reloaded.", null);
                    break;
                default:
                    MapCandidate target = offer.Target;
                    string said = string.Equals(target.Path, _mapPath, StringComparison.OrdinalIgnoreCase) ? $"{name} was saved again." : $"{target.Name} is a newer save of {name}.";
                    Show(said + " Start it as a new game? This game's progress is lost unless you save it first.", () => Reload(target));
                    break;
            }
        }

        private void Show(string message, Action confirm)
        {
            _dialogOpen = true;
            LastMessage = message;
            LastConfirm = confirm;
            DialogBoxShower.Builder builder = _dialogBoxShower.Create().SetMessage(message);
            if (confirm == null)
            {
                builder.SetConfirmButton(Closed, "OK");
            }
            else
            {
                builder.SetConfirmButton(confirm, "Reload").SetCancelButton(Closed, "Keep playing");
            }
            LastDialog = builder.Show();
        }

        private void Closed()
        {
            _dialogOpen = false;
        }

        // A new game with the same faction and difficulty on the newest save. The settlement name is the one this
        // game started with: empty when the game asked for it, so it asks again.
        private void Reload(MapCandidate target)
        {
            _dialogOpen = false;
            CompanionEnv.Log("reloading " + target.Path);
            _gameSceneLoader.StartNewGame(new NewGameConfiguration(_config.FactionId, MapFileReference.FromDisk(target.Path), _config.GameMode, _config.SettlementName));
        }
    }
}

using System;
using System.Collections.Generic;
using System.Linq;
using Timberborn.CoreUI;
using Timberborn.FactionSystem;
using Timberborn.GameSceneLoading;
using Timberborn.MainMenuPanels;
using Timberborn.MapRepositorySystem;
using Timberborn.NewGameConfigurationSystem;
using Timberborn.SingletonSystem;
using Timberborn.TooltipSystem;
using UnityEngine;
using UnityEngine.UIElements;

namespace DGMCompanion
{
    // The main menu's "Play latest Dam Good Maps map" entry: the newest map Dam Good Maps saved in the Maps
    // folder, with its name, and one click starts a new game on it with the last faction and difficulty.
    public class MainMenuEntry : IPostLoadableSingleton
    {
        public const string ButtonName = "DGMCompanionPlayLatest";
        public const string Title = "Play latest Dam Good Maps map";

        private readonly MainMenuPanel _mainMenuPanel;
        private readonly GameSceneLoader _gameSceneLoader;
        private readonly FactionSpecService _factionSpecService;
        private readonly FactionUnlockingService _factionUnlockingService;
        private readonly GameModeSpecService _gameModeSpecService;
        private readonly ITooltipRegistrar _tooltipRegistrar;

        private Button _button;
        private Label _caption;

        // What the entry shows now (the test reads these).
        public static string ShownCaption { get; private set; }
        public static Button ShownButton { get; private set; }
        public static string StartedMap { get; private set; }
        public static string StartedFaction { get; private set; }
        public static string StartedMode { get; private set; }
        // The factions (locked ones marked) and difficulties this game offers, for the test's record.
        public static string Options { get; private set; }

        public MainMenuEntry(MainMenuPanel mainMenuPanel, GameSceneLoader gameSceneLoader, FactionSpecService factionSpecService, FactionUnlockingService factionUnlockingService, GameModeSpecService gameModeSpecService, ITooltipRegistrar tooltipRegistrar)
        {
            _mainMenuPanel = mainMenuPanel;
            _gameSceneLoader = gameSceneLoader;
            _factionSpecService = factionSpecService;
            _factionUnlockingService = factionUnlockingService;
            _gameModeSpecService = gameModeSpecService;
            _tooltipRegistrar = tooltipRegistrar;
        }

        public void PostLoad()
        {
            try
            {
                Build();
            }
            catch (Exception e)
            {
                // The menu must never break because of the companion.
                CompanionEnv.Warn("could not add the menu entry: " + e);
            }
        }

        private void Build()
        {
            MapCandidate map = LatestMap.Find(CompanionEnv.MapsFolder(CompanionEnv.LoadSettings()));
            if (map == null)
            {
                CompanionEnv.Log("no Dam Good Maps map in the Maps folder; the menu stays as it is.");
                return;
            }
            VisualElement root = _mainMenuPanel.GetPanel();
            Button anchor = root.Q<Button>("NewGameButton");
            if (anchor == null || anchor.parent == null)
            {
                CompanionEnv.Warn("the main menu has no new-game button to put the entry beside.");
                return;
            }
            // The entry copies the look of the menu's own buttons (their classes), so it is theirs in every
            // theme and size, and it sits right under New game.
            _button = new Button { name = ButtonName, text = Title };
            foreach (string c in anchor.GetClasses())
            {
                _button.AddToClassList(c);
            }
            _button.RegisterCallback<ClickEvent>(OnClicked);
            VisualElement parent = anchor.parent;
            int at = parent.IndexOf(anchor) + 1;
            parent.Insert(at, _button);
            _caption = new Label { name = ButtonName + "Caption" };
            _caption.pickingMode = PickingMode.Ignore;
            _caption.style.fontSize = 13;
            _caption.style.unityTextAlign = TextAnchor.UpperCenter;
            _caption.style.opacity = 0.75f;
            _caption.style.marginTop = -2;
            _caption.style.marginBottom = 6;
            parent.Insert(at + 1, _caption);
            Refresh(map);
            ShownButton = _button;
            Options = "factions: " + string.Join(", ", _factionSpecService.Factions.OrderBy(f => f.Order).Select(f => f.Id + (_factionUnlockingService.IsLocked(f) ? " (locked)" : ""))) + "; modes: " + string.Join(", ", _gameModeSpecService.GetSpecsOrdered().Select(m => ModeSnapshot.NamedMode(m) ?? "?"));
        }

        private void Refresh(MapCandidate map)
        {
            _caption.text = LatestMap.Caption(map);
            ShownCaption = _caption.text;
            _tooltipRegistrar.Register(_button, () => Describe());
        }

        private string Describe()
        {
            try
            {
                return DescribeNow();
            }
            catch (Exception e)
            {
                CompanionEnv.Warn("could not describe the entry: " + e.Message);
                return Title;
            }
        }

        private string DescribeNow()
        {
            MapCandidate map = LatestMap.Find(CompanionEnv.MapsFolder(CompanionEnv.LoadSettings()));
            if (map == null)
            {
                return "No Dam Good Maps map found";
            }
            CompanionSettings s = CompanionEnv.LoadSettings();
            return $"{map.Name}: {FactionName(s)}, {ModeName(s)}";
        }

        private string FactionName(CompanionSettings s)
        {
            FactionSpec f = ChooseFaction(s);
            return f.DisplayName.Value;
        }

        private string ModeName(CompanionSettings s) => s.Mode ?? (s.CustomMode != null ? "custom" : ModeSnapshot.NamedMode(_gameModeSpecService.GetDefaultSpec()) ?? "default");

        private void OnClicked(ClickEvent evt)
        {
            try
            {
                Play();
            }
            catch (Exception e)
            {
                CompanionEnv.Warn("could not start the map: " + e);
            }
        }

        // The last faction, unless it is gone or locked; else the first faction the player can play.
        public FactionSpec ChooseFaction(CompanionSettings s)
        {
            List<FactionSpec> ordered = _factionSpecService.Factions.OrderBy(f => f.Order).ToList();
            FactionSpec remembered = ordered.FirstOrDefault(f => f.Id == s.Faction);
            if (remembered != null && !_factionUnlockingService.IsLocked(remembered))
            {
                return remembered;
            }
            return ordered.FirstOrDefault(f => !_factionUnlockingService.IsLocked(f)) ?? ordered.First();
        }

        public GameModeSpec ChooseMode(CompanionSettings s)
        {
            GameModeSpec named = ModeSnapshot.Named(_gameModeSpecService.GetSpecsOrdered(), s.Mode);
            if (named != null)
            {
                return named;
            }
            GameModeSpec fallback = _gameModeSpecService.GetDefaultSpec();
            return s.CustomMode != null ? ModeSnapshot.FromNumbers(s.CustomMode, fallback) : fallback;
        }

        private void Play()
        {
            CompanionSettings settings = CompanionEnv.LoadSettings();
            // Looked up again at the click: the app may have saved a newer map since the menu opened.
            MapCandidate map = LatestMap.Find(CompanionEnv.MapsFolder(settings));
            if (map == null)
            {
                CompanionEnv.Warn("the map is gone; nothing started.");
                return;
            }
            FactionSpec faction = ChooseFaction(settings);
            GameModeSpec mode = ChooseMode(settings);
            StartedMap = map.Path;
            StartedFaction = faction.Id;
            StartedMode = ModeSnapshot.NamedMode(mode) ?? "custom";
            CompanionEnv.Log($"starting {map.Path} as {faction.Id}, {StartedMode}");
            // The same call the game's own New game panel makes; an empty settlement name makes the game ask.
            _gameSceneLoader.StartNewGame(new NewGameConfiguration(faction.Id, MapFileReference.FromDisk(map.Path), mode, string.Empty));
        }
    }
}

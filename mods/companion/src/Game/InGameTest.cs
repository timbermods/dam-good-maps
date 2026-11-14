using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Timberborn.ApplicationLifetime;
using Timberborn.Intro;
using Timberborn.MapRepositorySystem;
using Timberborn.SingletonSystem;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.UIElements;

namespace DGMCompanion
{
    // The automatic in-game check. The DGM Probe runner (investigation/probe/runner/companion.ts, "--companion")
    // launches the game with -dgmcompanionTest <scratch folder> and drives it; nothing here runs in a normal
    // launch. The test uses the menu entry the way a player does (a click on the real button), then the reload
    // key (a real key press queued into the Input System), and writes what happened to <scratch>/result.json
    // before it quits the game.
    //
    // The runner and the test talk through files in the scratch folder: when the test needs the runner to do
    // something (put the maps in the Maps folder, save the map again), it writes ask-N.json and waits for the
    // runner to write answer-N.json, whose fields tell it what to expect.
    public static class TestLog
    {
        private static readonly object Gate = new object();
        // The test never hangs: it ends, with what it has recorded, when it takes too long altogether or too long in one
        // phase. A phase's clock starts again when its scene has loaded: loading a game took two minutes on a busy
        // machine (2026-10-30), and only the whole test's clock counts that.
        public const float TotalSeconds = 600f;
        public const float PhaseSeconds = 150f;

        private static string _phase = "menu";
        private static float _phaseAt = -1f;
        private static float _beganAt = -1f;

        public static string Phase
        {
            get => _phase;
            set
            {
                _phase = value;
                _phaseAt = Time.realtimeSinceStartup;
            }
        }

        // True once result.json is written: nothing more is checked.
        public static bool Done { get; private set; }

        // Called when a scene (the menu, a game) has loaded: the whole test's clock starts once, the phase's clock again.
        public static void Begin()
        {
            _phaseAt = Time.realtimeSinceStartup;
            if (_beganAt < 0)
            {
                _beganAt = _phaseAt;
            }
        }

        public static void Watchdog()
        {
            if (Done)
            {
                return;
            }
            float now = Time.realtimeSinceStartup;
            if (_beganAt >= 0 && now - _beganAt > TotalSeconds)
            {
                Failures.Add("the test took over " + TotalSeconds + " s (phase " + _phase + ")");
                Finish();
            }
            else if (_phaseAt >= 0 && now - _phaseAt > PhaseSeconds)
            {
                Failures.Add("phase " + _phase + " took over " + PhaseSeconds + " s");
                Finish();
            }
        }
        public static readonly List<string> Failures = new List<string>();
        public static readonly Dictionary<string, string> Facts = new Dictionary<string, string>();

        public static void Line(string text)
        {
            CompanionEnv.Log("test: " + text);
            try
            {
                lock (Gate)
                {
                    File.AppendAllText(Path.Combine(CompanionEnv.TestDir, "events.log"), DateTime.UtcNow.ToString("HH:mm:ss.fff") + " " + text + "\n", new UTF8Encoding(false));
                }
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            {
                // the log is a convenience; the result is what counts
            }
        }

        public static void Check(bool ok, string what)
        {
            Line((ok ? "ok: " : "FAIL: ") + what);
            if (!ok)
            {
                Failures.Add(what);
            }
        }

        public static void Fact(string key, string value)
        {
            Facts[key] = value ?? "";
            Line(key + " = " + value);
        }

        public static void Finish()
        {
            if (Done)
            {
                return;
            }
            Done = true;
            List<string> facts = new List<string>();
            foreach (KeyValuePair<string, string> f in Facts)
            {
                facts.Add(MiniJson.Quote(f.Key) + ": " + MiniJson.Quote(f.Value));
            }
            List<string> failures = new List<string>();
            foreach (string f in Failures)
            {
                failures.Add(MiniJson.Quote(f));
            }
            string json = "{\n  \"passed\": " + (Failures.Count == 0 ? "true" : "false") + ",\n  \"failures\": [" + string.Join(", ", failures) + "],\n  \"facts\": {" + string.Join(", ", facts) + "}\n}\n";
            string path = Path.Combine(CompanionEnv.TestDir, "result.json");
            try
            {
                File.WriteAllText(path + ".tmp", json, new UTF8Encoding(false));
                File.Move(path + ".tmp", path);
            }
            catch (Exception e)
            {
                CompanionEnv.Warn("could not write result.json: " + e.Message);
            }
            Line("finished: " + (Failures.Count == 0 ? "passed" : "failed"));
            GameQuitter.Quit();
        }

        public static void Guard(Action step)
        {
            if (Done)
            {
                return;
            }
            try
            {
                step();
                // A failed check ends the test at once, with what was recorded.
                if (Failures.Count > 0)
                {
                    Finish();
                }
            }
            catch (Exception e)
            {
                Failures.Add("exception: " + e.Message);
                Line("exception: " + e);
                Finish();
            }
        }
    }

    // A request to the runner and its answer (files in the scratch folder, written whole and renamed so a
    // half-written file is never read).
    public static class Handshake
    {
        public const float WaitSeconds = 60f;

        private static int _seq;
        private static float _askedAt;
        private static Dictionary<string, object> _answer;

        // The newest request still waiting for its answer (0: none).
        public static int Waiting { get; private set; }

        public static void Ask(string what)
        {
            _seq++;
            Waiting = _seq;
            _answer = null;
            _askedAt = Time.realtimeSinceStartup;
            string path = Path.Combine(CompanionEnv.TestDir, "ask-" + _seq + ".json");
            File.WriteAllText(path + ".tmp", "{\"seq\": " + _seq + ", \"what\": " + MiniJson.Quote(what) + ", \"phase\": " + MiniJson.Quote(TestLog.Phase) + "}\n", new UTF8Encoding(false));
            File.Move(path + ".tmp", path);
            TestLog.Line("asked the runner: " + what);
        }

        // True when nothing is awaited or the runner has answered (the fields are then in Answer); after a
        // long wait the test fails and quits.
        public static bool Ready()
        {
            if (TestLog.Done)
            {
                return false;
            }
            if (Waiting == 0)
            {
                return true;
            }
            string path = Path.Combine(CompanionEnv.TestDir, "answer-" + Waiting + ".json");
            if (File.Exists(path))
            {
                string text;
                try
                {
                    // Shared with a writer that has not let go yet (the runner renames the finished file in, but a
                    // scanner may still hold it); on a sharing violation, look again next frame.
                    using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    using (StreamReader reader = new StreamReader(stream, new UTF8Encoding(false)))
                    {
                        text = reader.ReadToEnd();
                    }
                }
                catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
                {
                    return false;
                }
                if (!MiniJson.TryParseObject(text, out _answer))
                {
                    return false;
                }
                TestLog.Line("the runner answered " + Waiting);
                Waiting = 0;
                return true;
            }
            if (Time.realtimeSinceStartup - _askedAt > WaitSeconds)
            {
                TestLog.Failures.Add("the runner did not answer request " + Waiting + " in " + WaitSeconds + " s");
                Waiting = 0;
                TestLog.Finish();
            }
            return false;
        }

        public static string Answer(string key) => _answer == null ? null : MiniJson.GetString(_answer, key);
    }

    // Looking at the game's own interface (every UIDocument's elements), not at the companion's references.
    public static class UiProbe
    {
        public static List<VisualElement> Roots()
        {
            List<VisualElement> roots = new List<VisualElement>();
            foreach (UIDocument document in UnityEngine.Object.FindObjectsByType<UIDocument>())
            {
                if (document != null && document.rootVisualElement != null)
                {
                    roots.Add(document.rootVisualElement);
                }
            }
            return roots;
        }

        public static Button FindButton(string name)
        {
            foreach (VisualElement root in Roots())
            {
                Button button = root.Q<Button>(name);
                if (button != null)
                {
                    return button;
                }
            }
            return null;
        }

        // The game's settlement-name prompt (Game/SettlementNameBox: a text field "Input" beside "ConfirmButton"
        // and "RelocateButton"), when it is on screen; null when it is not. `seen` says what was looked at.
        public static TextField SettlementPrompt(out string seen)
        {
            int inputs = 0;
            List<VisualElement> roots = Roots();
            foreach (VisualElement root in roots)
            {
                foreach (TextField input in root.Query<TextField>("Input").ToList())
                {
                    inputs++;
                    VisualElement box = input;
                    for (int i = 0; i < 8 && box != null; i++, box = box.parent)
                    {
                        if (box.Q<Button>("ConfirmButton") != null && box.Q<Button>("RelocateButton") != null)
                        {
                            bool shown = input.resolvedStyle.display != DisplayStyle.None && input.resolvedStyle.visibility == Visibility.Visible && input.worldBound.width > 0f;
                            seen = $"{roots.Count} documents, {inputs} inputs, prompt {(shown ? "shown" : "hidden")}";
                            return shown ? input : null;
                        }
                    }
                }
            }
            seen = $"{roots.Count} documents, {inputs} inputs, no prompt";
            return null;
        }
    }

    // In the main menu: once it is on screen, with no Dam Good Maps map the entry is absent; once the runner has
    // put the maps in, it appears, and a click on it starts a game.
    public class MenuTest : IPostLoadableSingleton, IUpdatableSingleton
    {
        private const float MenuSeconds = 90f;
        private const float LayoutSeconds = 10f;

        private readonly IntroBox _introBox;
        private float _startedAt = -1f;
        private float _nextAt;
        private float _waitFrom;
        private int _step;
        private bool _introSkipped;

        public MenuTest(IntroBox introBox)
        {
            _introBox = introBox;
        }

        public void PostLoad()
        {
            Application.runInBackground = true;
            TestLog.Begin();
            _startedAt = Time.realtimeSinceStartup;
            _nextAt = _startedAt + 1f;
            _waitFrom = _startedAt;
            TestLog.Line("main menu loaded, phase " + TestLog.Phase);
        }

        // Whatever goes wrong in the update ends the variant with a FAIL and a result.json, never an uncaught exception.
        public void UpdateSingleton() => TestLog.Guard(Tick);

        private void Tick()
        {
            if (_startedAt < 0)
            {
                return;
            }
            TestLog.Watchdog();
            if (TestLog.Done || TestLog.Phase != "menu" || Time.realtimeSinceStartup < _nextAt || !Handshake.Ready())
            {
                return;
            }
            Step();
        }

        // The menu is on screen when the intro is over and the New game button has a size.
        private bool MenuShown()
        {
            if (_introBox.GetPanel() != null)
            {
                return false;
            }
            Button anchor = MainMenuEntry.Current?.NewGameButton();
            return anchor != null && anchor.panel != null && anchor.resolvedStyle.display != DisplayStyle.None && anchor.worldBound.width > 1f && anchor.worldBound.height > 1f;
        }

        private void Step()
        {
            float now = Time.realtimeSinceStartup;
            _nextAt = now + 0.5f;
            switch (_step)
            {
                case 0:
                    if (!MenuShown())
                    {
                        // The game starts with its intro video; a player skips it, so the test does too, once.
                        if (!_introSkipped && now - _startedAt > 6f && _introBox.GetPanel() != null)
                        {
                            _introSkipped = true;
                            TestLog.Line("skipping the intro");
                            _introBox.OnUICancelled();
                        }
                        if (now - _startedAt > MenuSeconds)
                        {
                            TestLog.Check(false, "the main menu was not on screen " + MenuSeconds + " s after it loaded");
                        }
                        return;
                    }
                    TestLog.Line("the main menu is on screen " + (now - _startedAt).ToString("0.0") + " s after it loaded");
                    _step = 1;
                    break;
                case 1:
                    // Nothing in the Maps folder is a Dam Good Maps map (a look-alike and an unreadable dgm- file only).
                    TestLog.Fact("userMapsDirectory", MapRepository.UserMapsDirectory);
                    TestLog.Fact("mapsFolder", CompanionEnv.MapsFolder(CompanionEnv.LoadSettings()));
                    TestLog.Check(MainMenuEntry.ShownButton == null && !MainMenuEntry.Current.HasEntry(), "with no Dam Good Maps map in the Maps folder the menu has no entry");
                    Handshake.Ask("maps");
                    _step = 2;
                    break;
                case 2:
                    // The runner has put the maps in; the entry looks again, as it does when the menu opens.
                    TestLog.Fact("expectedMap", Handshake.Answer("newest"));
                    MainMenuEntry.Current.Rebuild();
                    _waitFrom = now;
                    _step = 3;
                    break;
                case 3:
                    Button shown = MainMenuEntry.ShownButton;
                    bool laidOut = shown != null && shown.panel != null && shown.worldBound.width > 1f;
                    // (a second after it is laid out, so the caption's colour, set once it has a size, is drawn)
                    if ((!laidOut || now - _waitFrom < 1f) && now - _waitFrom < LayoutSeconds)
                    {
                        return;
                    }
                    DumpMenu();
                    TestLog.Fact("menuCaption", MainMenuEntry.ShownCaption);
                    TestLog.Fact("options", MainMenuEntry.Options);
                    TestLog.Check(laidOut && MainMenuEntry.Current.HasEntry(), "with Dam Good Maps maps present the menu has the entry on screen");
                    TestLog.Check(shown?.text == MainMenuEntry.Title, "the entry says " + MainMenuEntry.Title);
                    // It looks like the menu's own entries: a button of their kind (the game draws its frame), and a
                    // caption in their text colour.
                    Button newGame = MainMenuEntry.Current.NewGameButton();
                    TestLog.Check(shown != null && newGame != null && shown.GetType() == newGame.GetType(), "the entry is a button of the menu's own kind: " + shown?.GetType().Name);
                    Label caption = shown?.parent?.Q<Label>(MainMenuEntry.ButtonName + "Caption");
                    TestLog.Check(caption != null && newGame != null && caption.resolvedStyle.color == newGame.resolvedStyle.color, "the caption has the menu's text colour: " + caption?.resolvedStyle.color);
                    TestLog.Check(MainMenuEntry.ShownCaption != null && MainMenuEntry.ShownCaption.StartsWith(Handshake.Answer("newest") ?? "?"), "the entry names the newest Dam Good Maps map: " + MainMenuEntry.ShownCaption);
                    ScreenCapture.CaptureScreenshot(Path.Combine(CompanionEnv.TestDir, "menu.png"));
                    _step = 4;
                    break;
                default:
                    Button button = MainMenuEntry.ShownButton;
                    TestLog.Phase = "game1";
                    using (ClickEvent click = ClickEvent.GetPooled())
                    {
                        click.target = button;
                        button.SendEvent(click);
                    }
                    TestLog.Fact("startedMap", MainMenuEntry.StartedMap);
                    TestLog.Fact("startedFaction", MainMenuEntry.StartedFaction);
                    TestLog.Fact("startedMode", MainMenuEntry.StartedMode);
                    TestLog.Check(!string.IsNullOrEmpty(MainMenuEntry.StartedMap), "the click started a game");
                    break;
            }
        }

        private static void DumpMenu()
        {
            if (MainMenuEntry.ShownButton == null || MainMenuEntry.ShownButton.parent == null)
            {
                return;
            }
            StringBuilder b = new StringBuilder();
            VisualElement parent = MainMenuEntry.ShownButton.parent;
            b.AppendLine("The menu column holding the entry:");
            for (int i = 0; i < parent.childCount; i++)
            {
                VisualElement c = parent[i];
                b.AppendLine($"  [{i}] {c.GetType().Name} name={c.name} classes=[{string.Join(" ", c.GetClasses())}] text={(c as TextElement)?.text} display={c.resolvedStyle.display} size={c.worldBound.width}x{c.worldBound.height} margin={c.resolvedStyle.marginTop}/{c.resolvedStyle.marginBottom}");
            }
            File.WriteAllText(Path.Combine(CompanionEnv.TestDir, "menu-tree.txt"), b.ToString());
        }
    }

    // In the game: press the reload key as a player would, answer its dialogs, and check the new game.
    public class GameTest : IPostLoadableSingleton, IUpdatableSingleton
    {
        private float _startedAt = -1f;
        private float _nextAt;
        private int _step;
        private bool _keysDown;
        private string _phase;

        public void PostLoad()
        {
            Application.runInBackground = true;
            // A game window that is not in front still gets the test's key presses.
            InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
            TestLog.Begin();
            _startedAt = Time.realtimeSinceStartup;
            _nextAt = _startedAt + 8f;
            _phase = TestLog.Phase;
            TestLog.Line("game loaded, phase " + _phase);
        }

        public void UpdateSingleton() => TestLog.Guard(Tick);

        private void Tick()
        {
            if (_startedAt < 0)
            {
                return;
            }
            TestLog.Watchdog();
            if (TestLog.Done)
            {
                return;
            }
            if (_keysDown)
            {
                // The release goes in a later frame than the press, so the press registers.
                InputSystem.QueueStateEvent(Keyboard.current, new KeyboardState());
                _keysDown = false;
            }
            if (Time.realtimeSinceStartup < _nextAt || !Handshake.Ready())
            {
                return;
            }
            Step();
        }

        private void Press()
        {
            Keyboard keyboard = Keyboard.current;
            TestLog.Check(keyboard != null, "the game has a keyboard");
            KeyChord.TryParse(CompanionEnv.LoadSettings().ReloadKey, out KeyChord chord);
            List<Key> keys = new List<Key>();
            if (chord.Ctrl) keys.Add(Key.LeftCtrl);
            if (chord.Shift) keys.Add(Key.LeftShift);
            if (chord.Alt) keys.Add(Key.LeftAlt);
            keys.Add((Key)Enum.Parse(typeof(Key), chord.Key, true));
            InputSystem.QueueStateEvent(keyboard, new KeyboardState(keys.ToArray()));
            _keysDown = true;
            _nextAt = Time.realtimeSinceStartup + 1f;
        }

        // The settlement-name prompt the game shows for a new game started with no name.
        private static void CheckPrompt(string which)
        {
            TextField prompt = UiProbe.SettlementPrompt(out string seen);
            TestLog.Fact(which + ".promptSeen", seen);
            TestLog.Check(prompt != null, "the game asks for the settlement name (" + which + ")");
        }

        private void Step()
        {
            string notSaved = "has not been saved again";
            string resaved = Handshake.Answer("resaved") ?? "?";
            if (_phase == "game1")
            {
                switch (_step)
                {
                    case 0:
                        TestLog.Fact("game1.map", GameCompanion.MapPath);
                        TestLog.Fact("game1.faction", GameCompanion.Faction);
                        TestLog.Fact("game1.mode", GameCompanion.Mode);
                        TestLog.Fact("game1.settings", File.Exists(CompanionEnv.SettingsFile) ? File.ReadAllText(CompanionEnv.SettingsFile).Replace("\n", " ") : "(none)");
                        TestLog.Check(GameCompanion.MapPath == MainMenuEntry.StartedMap, "the game runs the map the menu entry started");
                        CheckPrompt("game1");
                        Press();
                        break;
                    case 1:
                        TestLog.Check(GameCompanion.KeyPresses == 1, "the reload key was seen once");
                        TestLog.Check(GameCompanion.LastMessage != null && GameCompanion.LastMessage.Contains(notSaved), "an untouched file says it has not been saved again: " + GameCompanion.LastMessage);
                        GameCompanion.LastDialog?.OnUIConfirmed();
                        // The app saves the map again as a new file (-2): the runner writes it now.
                        Handshake.Ask("resave");
                        break;
                    case 2:
                        TestLog.Fact("resaved", resaved);
                        Press();
                        break;
                    case 3:
                        TestLog.Check(GameCompanion.KeyPresses == 2, "the reload key was seen again");
                        TestLog.Check(GameCompanion.LastMessage != null && GameCompanion.LastMessage.Contains(resaved), "a re-saved map (-2) is offered on the key: " + GameCompanion.LastMessage);
                        TestLog.Check(GameCompanion.LastConfirm != null, "the dialog has a Reload button");
                        // "Keep playing": the game carries on, and the key still works afterwards.
                        GameCompanion.LastDialog?.OnUICancelled();
                        Press();
                        break;
                    case 4:
                        TestLog.Check(GameCompanion.KeyPresses == 3, "the key works again after Keep playing");
                        TestLog.Check(GameCompanion.LastMessage != null && GameCompanion.LastMessage.Contains(resaved), "it asks again: " + GameCompanion.LastMessage);
                        TestLog.Phase = "game2";
                        GameCompanion.LastDialog?.OnUIConfirmed();
                        break;
                    default:
                        return;
                }
                _step++;
                _nextAt = Math.Max(_nextAt, Time.realtimeSinceStartup + 0.5f);
                return;
            }
            if (_phase == "game2")
            {
                switch (_step)
                {
                    case 0:
                        TestLog.Fact("game2.map", GameCompanion.MapPath);
                        TestLog.Fact("game2.faction", GameCompanion.Faction);
                        TestLog.Fact("game2.mode", GameCompanion.Mode);
                        TestLog.Check(GameCompanion.MapPath != null && Path.GetFileNameWithoutExtension(GameCompanion.MapPath) == resaved, "the reloaded game runs the re-saved file");
                        TestLog.Check(GameCompanion.Faction != null && GameCompanion.Faction == TestLog.Facts["game1.faction"] && GameCompanion.Mode == TestLog.Facts["game1.mode"], "the reload keeps the faction and difficulty");
                        CheckPrompt("game2");
                        Press();
                        break;
                    case 1:
                        TestLog.Check(GameCompanion.LastMessage != null && GameCompanion.LastMessage.Contains(notSaved), "after the reload the file counts as unchanged: " + GameCompanion.LastMessage);
                        GameCompanion.LastDialog?.OnUIConfirmed();
                        TestLog.Finish();
                        break;
                    default:
                        return;
                }
                _step++;
                _nextAt = Time.realtimeSinceStartup + 1f;
            }
        }
    }
}

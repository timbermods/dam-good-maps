using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Timberborn.ApplicationLifetime;
using Timberborn.SingletonSystem;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.UIElements;

namespace DGMCompanion
{
    // The automatic in-game check (mods/companion/scripts/ingame-test.ts launches the game with
    // -dgmcompanionTest <scratch folder>; nothing here runs in a normal launch). It uses the menu entry the
    // way a player does (a click on the real button), then the reload key (a real key press queued into the
    // Input System), and writes what happened to <scratch>/result.json before it quits the game.
    public static class TestLog
    {
        private static readonly object Gate = new object();
        public static string Phase = "menu";
        public static readonly List<string> Failures = new List<string>();
        public static readonly Dictionary<string, string> Facts = new Dictionary<string, string>();

        public static void Line(string text)
        {
            CompanionEnv.Log("test: " + text);
            lock (Gate)
            {
                File.AppendAllText(Path.Combine(CompanionEnv.TestDir, "events.log"), DateTime.UtcNow.ToString("HH:mm:ss.fff") + " " + text + "\n", new UTF8Encoding(false));
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
            File.WriteAllText(path + ".tmp", json, new UTF8Encoding(false));
            File.Move(path + ".tmp", path);
            Line("finished: " + (Failures.Count == 0 ? "passed" : "failed"));
            GameQuitter.Quit();
        }

        public static void Guard(Action step)
        {
            try
            {
                step();
            }
            catch (Exception e)
            {
                Failures.Add("exception: " + e.Message);
                Line("exception: " + e);
                Finish();
            }
        }
    }

    // In the main menu: look at the entry, then click it.
    public class MenuTest : IPostLoadableSingleton, IUpdatableSingleton
    {
        private float _startedAt = -1f;
        private int _step;

        public void PostLoad()
        {
            Application.runInBackground = true;
            _startedAt = Time.realtimeSinceStartup;
            TestLog.Line("main menu loaded, phase " + TestLog.Phase);
        }

        public void UpdateSingleton()
        {
            if (_startedAt < 0 || TestLog.Phase != "menu" || Time.realtimeSinceStartup < _startedAt + 4f + _step * 1.5f)
            {
                return;
            }
            TestLog.Guard(() =>
            {
                if (_step == 0)
                {
                    DumpMenu();
                    string caption = MainMenuEntry.ShownCaption;
                    TestLog.Fact("menuCaption", caption);
                    TestLog.Fact("options", MainMenuEntry.Options);
                    TestLog.Check(MainMenuEntry.ShownButton != null, "the menu has the entry");
                    TestLog.Check(MainMenuEntry.ShownButton?.text == MainMenuEntry.Title, "the entry says " + MainMenuEntry.Title);
                    ScreenCapture.CaptureScreenshot(Path.Combine(CompanionEnv.TestDir, "menu.png"));
                    _step = 1;
                }
                else
                {
                    Button button = MainMenuEntry.ShownButton;
                    if (button == null)
                    {
                        TestLog.Finish();
                        return;
                    }
                    TestLog.Phase = "game1";
                    using (ClickEvent click = ClickEvent.GetPooled())
                    {
                        click.target = button;
                        button.SendEvent(click);
                    }
                    TestLog.Fact("startedMap", MainMenuEntry.StartedMap);
                    TestLog.Fact("startedFaction", MainMenuEntry.StartedFaction);
                    TestLog.Fact("startedMode", MainMenuEntry.StartedMode);
                    TestLog.Check(MainMenuEntry.StartedMap != null, "the click started a game");
                    _step = 2;
                }
            });
        }

        private static void DumpMenu()
        {
            if (MainMenuEntry.ShownButton == null)
            {
                return;
            }
            StringBuilder b = new StringBuilder();
            VisualElement parent = MainMenuEntry.ShownButton.parent;
            b.AppendLine("The menu column holding the entry:");
            for (int i = 0; i < parent.childCount; i++)
            {
                VisualElement c = parent[i];
                b.AppendLine($"  [{i}] {c.GetType().Name} name={c.name} classes=[{string.Join(" ", c.GetClasses())}] text={(c as TextElement)?.text} display={c.resolvedStyle.display} size={c.resolvedStyle.width}x{c.resolvedStyle.height} margin={c.resolvedStyle.marginTop}/{c.resolvedStyle.marginBottom}");
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
            _startedAt = Time.realtimeSinceStartup;
            _nextAt = _startedAt + 8f;
            _phase = TestLog.Phase;
            TestLog.Line("game loaded, phase " + _phase);
        }

        public void UpdateSingleton()
        {
            if (_startedAt < 0)
            {
                return;
            }
            if (_keysDown)
            {
                // The release goes in a later frame than the press, so the press registers.
                InputSystem.QueueStateEvent(Keyboard.current, new KeyboardState());
                _keysDown = false;
            }
            if (Time.realtimeSinceStartup < _nextAt)
            {
                return;
            }
            TestLog.Guard(Step);
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

        private static string MapFile() => GameCompanion.MapPath;

        private void Step()
        {
            string notSaved = "has not been saved again";
            string saved = "was saved again";
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
                        Press();
                        break;
                    case 1:
                        TestLog.Check(GameCompanion.KeyPresses == 1, "the reload key was seen once");
                        TestLog.Check(GameCompanion.LastMessage != null && GameCompanion.LastMessage.Contains(notSaved), "an untouched file says it has not been saved again: " + GameCompanion.LastMessage);
                        GameCompanion.LastDialog?.OnUIConfirmed();
                        // Saved again: a newer time on the file, as the app's save leaves it.
                        File.SetLastWriteTimeUtc(MapFile(), DateTime.UtcNow.AddMinutes(3));
                        Press();
                        break;
                    case 2:
                        TestLog.Check(GameCompanion.LastMessage != null && GameCompanion.LastMessage.Contains(saved), "a re-saved file asks to reload: " + GameCompanion.LastMessage);
                        TestLog.Check(GameCompanion.LastConfirm != null, "the dialog has a Reload button");
                        // "Keep playing": the game carries on, and the key still works afterwards.
                        GameCompanion.LastDialog?.OnUICancelled();
                        Press();
                        break;
                    case 3:
                        TestLog.Check(GameCompanion.KeyPresses == 3, "the key works again after Keep playing");
                        TestLog.Check(GameCompanion.LastMessage != null && GameCompanion.LastMessage.Contains(saved), "it asks again");
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
                        TestLog.Check(GameCompanion.MapPath == MapFile() && GameCompanion.Faction != null, "the reloaded game runs the same map");
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

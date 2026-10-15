using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace DGMCompanion
{
    // A small JSON reader and writer, so the logic in src/Core needs nothing but the .NET standard library
    // and its tests run anywhere. Objects read as Dictionary<string, object>, arrays as List<object>,
    // numbers as double, then string, bool and null.
    public static class MiniJson
    {
        public static object Parse(string text)
        {
            int at = 0;
            SkipSpace(text, ref at);
            object value = ReadValue(text, ref at);
            SkipSpace(text, ref at);
            if (at != text.Length)
            {
                throw new FormatException("Unexpected text after the JSON value at " + at);
            }
            return value;
        }

        public static bool TryParseObject(string text, out Dictionary<string, object> obj)
        {
            obj = null;
            if (string.IsNullOrWhiteSpace(text))
            {
                return false;
            }
            try
            {
                obj = Parse(text.TrimStart((char)0xFEFF)) as Dictionary<string, object>;
            }
            catch (FormatException)
            {
                obj = null;
            }
            return obj != null;
        }

        public static string GetString(Dictionary<string, object> obj, string key)
        {
            return obj != null && obj.TryGetValue(key, out object v) ? v as string : null;
        }

        public static bool TryGetNumber(Dictionary<string, object> obj, string key, out double number)
        {
            number = 0;
            if (obj != null && obj.TryGetValue(key, out object v) && v is double d)
            {
                number = d;
                return true;
            }
            return false;
        }

        public static string Quote(string s)
        {
            StringBuilder b = new StringBuilder("\"");
            foreach (char c in s ?? "")
            {
                switch (c)
                {
                    case '"': b.Append("\\\""); break;
                    case '\\': b.Append("\\\\"); break;
                    case '\n': b.Append("\\n"); break;
                    case '\r': b.Append("\\r"); break;
                    case '\t': b.Append("\\t"); break;
                    default:
                        if (c < 0x20)
                        {
                            b.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            b.Append(c);
                        }
                        break;
                }
            }
            return b.Append('"').ToString();
        }

        public static string Number(double d) => d.ToString("R", CultureInfo.InvariantCulture);

        private static void SkipSpace(string t, ref int at)
        {
            while (at < t.Length && char.IsWhiteSpace(t[at]))
            {
                at++;
            }
        }

        private static object ReadValue(string t, ref int at)
        {
            if (at >= t.Length)
            {
                throw new FormatException("Unexpected end of JSON");
            }
            char c = t[at];
            if (c == '{')
            {
                return ReadObject(t, ref at);
            }
            if (c == '[')
            {
                return ReadArray(t, ref at);
            }
            if (c == '"')
            {
                return ReadString(t, ref at);
            }
            if (Match(t, ref at, "true"))
            {
                return true;
            }
            if (Match(t, ref at, "false"))
            {
                return false;
            }
            if (Match(t, ref at, "null"))
            {
                return null;
            }
            return ReadNumber(t, ref at);
        }

        private static bool Match(string t, ref int at, string word)
        {
            if (string.CompareOrdinal(t, at, word, 0, word.Length) == 0)
            {
                at += word.Length;
                return true;
            }
            return false;
        }

        private static Dictionary<string, object> ReadObject(string t, ref int at)
        {
            Dictionary<string, object> obj = new Dictionary<string, object>();
            at++;
            SkipSpace(t, ref at);
            if (at < t.Length && t[at] == '}')
            {
                at++;
                return obj;
            }
            while (true)
            {
                SkipSpace(t, ref at);
                if (at >= t.Length || t[at] != '"')
                {
                    throw new FormatException("Expected a property name at " + at);
                }
                string key = ReadString(t, ref at);
                SkipSpace(t, ref at);
                if (at >= t.Length || t[at] != ':')
                {
                    throw new FormatException("Expected ':' at " + at);
                }
                at++;
                SkipSpace(t, ref at);
                obj[key] = ReadValue(t, ref at);
                SkipSpace(t, ref at);
                if (at < t.Length && t[at] == ',')
                {
                    at++;
                    continue;
                }
                if (at < t.Length && t[at] == '}')
                {
                    at++;
                    return obj;
                }
                throw new FormatException("Expected ',' or '}' at " + at);
            }
        }

        private static List<object> ReadArray(string t, ref int at)
        {
            List<object> list = new List<object>();
            at++;
            SkipSpace(t, ref at);
            if (at < t.Length && t[at] == ']')
            {
                at++;
                return list;
            }
            while (true)
            {
                SkipSpace(t, ref at);
                list.Add(ReadValue(t, ref at));
                SkipSpace(t, ref at);
                if (at < t.Length && t[at] == ',')
                {
                    at++;
                    continue;
                }
                if (at < t.Length && t[at] == ']')
                {
                    at++;
                    return list;
                }
                throw new FormatException("Expected ',' or ']' at " + at);
            }
        }

        private static string ReadString(string t, ref int at)
        {
            StringBuilder b = new StringBuilder();
            at++;
            while (at < t.Length)
            {
                char c = t[at++];
                if (c == '"')
                {
                    return b.ToString();
                }
                if (c != '\\')
                {
                    b.Append(c);
                    continue;
                }
                if (at >= t.Length)
                {
                    break;
                }
                char e = t[at++];
                switch (e)
                {
                    case 'n': b.Append('\n'); break;
                    case 'r': b.Append('\r'); break;
                    case 't': b.Append('\t'); break;
                    case 'b': b.Append('\b'); break;
                    case 'f': b.Append('\f'); break;
                    case 'u':
                        if (at + 4 > t.Length || !int.TryParse(t.Substring(at, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int code))
                        {
                            throw new FormatException("Bad \\u escape at " + at);
                        }
                        b.Append((char)code);
                        at += 4;
                        break;
                    default: b.Append(e); break;
                }
            }
            throw new FormatException("Unterminated string");
        }

        private static double ReadNumber(string t, ref int at)
        {
            int start = at;
            while (at < t.Length && (char.IsDigit(t[at]) || t[at] == '-' || t[at] == '+' || t[at] == '.' || t[at] == 'e' || t[at] == 'E'))
            {
                at++;
            }
            if (at == start || !double.TryParse(t.Substring(start, at - start), NumberStyles.Float, CultureInfo.InvariantCulture, out double d))
            {
                throw new FormatException("Unexpected character at " + start);
            }
            return d;
        }
    }
}

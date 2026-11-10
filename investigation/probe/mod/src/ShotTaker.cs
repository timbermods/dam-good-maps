using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using Timberborn.CameraSystem;
using Timberborn.Rendering;
using Timberborn.TimeSystem;
using UnityEngine;

namespace DGMProbe
{
    // Screenshots without the game's interface, at fixed camera poses. The game's own camera is moved to
    // each pose through CameraService (so everything that follows the camera, such as shadows and detail,
    // follows it), then a second camera made from the game's camera prefab (as the game's save thumbnails
    // are) copies it exactly and renders into an image of the pose's size, with the UI layer left out.
    public class ShotTaker
    {
        private readonly CameraService _cameraService;
        private readonly CameraFactory _cameraFactory;
        private readonly SpeedManager _speedManager;
        private readonly ShadowDistanceUpdater _shadows;
        private Camera _camera;
        private float _baseDistance = 32f;
        private float _zoomBase = 1.3f;

        public bool Busy { get; private set; }

        public ShotTaker(CameraService cameraService, CameraFactory cameraFactory, SpeedManager speedManager, ShadowDistanceUpdater shadows)
        {
            _cameraService = cameraService;
            _cameraFactory = cameraFactory;
            _speedManager = speedManager;
            _shadows = shadows;
        }

        private Camera Main => _cameraService.Transform.GetComponent<Camera>();

        private void Prepare()
        {
            if (_camera != null)
            {
                return;
            }
            _camera = _cameraFactory.Create("DGMProbeShots");
            _camera.enabled = false;
            _camera.cullingMask &= ~Layers.UIMask.value;
            // The zoom's base distance and step, from the camera's own settings (32 and 1.3 in 1.1.2.4).
            try
            {
                object spec = typeof(CameraService).GetField("_cameraServiceSpec", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(_cameraService);
                if (spec != null)
                {
                    _baseDistance = (float)spec.GetType().GetProperty("BaseDistance").GetValue(spec);
                    _zoomBase = (float)spec.GetType().GetProperty("ZoomBase").GetValue(spec);
                }
            }
            catch (Exception)
            {
                // keep the defaults
            }
        }

        // The pose as a camera position and rotation in the game's world (x east, y up, z north).
        // Our 3D view's world has z = -north, so its orbit offset (sin yaw cos pitch, sin pitch, cos yaw cos pitch)
        // becomes (sin yaw cos pitch, sin pitch, -cos yaw cos pitch), looking at the target.
        private static void PoseToWorld(Pose p, out Vector3 target, out Vector3 position)
        {
            target = new Vector3(p.Target[0], p.Target[1], -p.Target[2]);
            float cp = Mathf.Cos(p.Pitch);
            Vector3 offset = new Vector3(Mathf.Sin(p.Yaw) * cp, Mathf.Sin(p.Pitch), -Mathf.Cos(p.Yaw) * cp) * p.Distance;
            position = target + offset;
        }

        public IEnumerator Take(string momentId, List<Pose> poses, List<string> wanted, MapResult result, float resumeSpeed)
        {
            Busy = true;
            Prepare();
            _speedManager.ChangeSpeed(0f);
            yield return null;
            yield return null;
            GraphicsDimmer.Restore();
            CameraState saved = _cameraService.GetCurrentState();
            float savedFov = _cameraService.FieldOfView;
            foreach (string id in wanted)
            {
                Pose pose = poses.Find(p => p.Id == id);
                if (pose == null)
                {
                    result.Notes.Add($"shot {momentId}/{id}: no such pose");
                    continue;
                }
                Vector3 target = Vector3.zero, position = Vector3.zero;
                float fov = savedFov;
                if (pose.Kind == "current")
                {
                    _cameraService.RestoreState(saved);
                }
                else
                {
                    PoseToWorld(pose, out target, out position);
                    // Move the game's camera close to the pose, for its shadows and level of detail.
                    float zoom = Mathf.Log(Mathf.Max(1f, pose.Distance) / _baseDistance) / Mathf.Log(_zoomBase);
                    _cameraService.RestoreState(new CameraState(target, zoom, -pose.Yaw * Mathf.Rad2Deg, pose.Pitch * Mathf.Rad2Deg));
                    if (pose.Kind == "look")
                    {
                        fov = pose.FovY;
                    }
                }
                _cameraService.FieldOfView = fov;
                for (int i = 0; i < 12; i++)
                {
                    yield return null;
                }
                yield return new WaitForEndOfFrame();
                string file = $"{Probe.SafeName(result.MapId)}-{Probe.SafeName(momentId)}-{Probe.SafeName(id)}.jpg";
                try
                {
                    Transform main = Main.transform;
                    if (pose.Kind == "current")
                    {
                        _camera.transform.SetPositionAndRotation(main.position, main.rotation);
                    }
                    else
                    {
                        _camera.transform.SetPositionAndRotation(position, Quaternion.LookRotation(target - position, Vector3.up));
                    }
                    _camera.fieldOfView = fov;
                    Render(pose.Width, pose.Height, pose.Kind == "current" ? 150f : Mathf.Min(1000f, pose.Distance * 2.5f), Path.Combine(Probe.ShotsDir, file));
                    result.Shots.Add(new ShotRecord { MomentId = momentId, Pose = id, File = Path.Combine(Probe.Job.RunId, file), Day = Probe.Day, Camera = CameraOf(pose.Width, pose.Height) });
                    Probe.ShotsTaken++;
                }
                catch (Exception e)
                {
                    result.Notes.Add($"shot {momentId}/{id} failed: {e.Message}");
                }
            }
            _cameraService.RestoreState(saved);
            _cameraService.FieldOfView = savedFov;
            yield return null;
            GraphicsDimmer.Dim();
            _speedManager.ChangeSpeed(resumeSpeed);
            Busy = false;
        }

        // The camera the shot was just rendered with, and the game's own camera state (0.3.4).
        private ShotCamera CameraOf(int width, int height)
        {
            Transform t = _camera.transform;
            CameraState state = _cameraService.GetCurrentState();
            float[] V(Vector3 v) => new[] { v.x, v.y, v.z };
            return new ShotCamera
            {
                Position = V(t.position),
                Forward = V(t.forward),
                Up = V(t.up),
                FieldOfView = _camera.fieldOfView,
                Aspect = (float)width / height,
                Near = _camera.nearClipPlane,
                Far = _camera.farClipPlane,
                StateTarget = V(state.Target),
                StateZoom = state.ZoomLevel,
                StateHorizontal = state.HorizontalAngle,
                StateVertical = state.VerticalAngle,
            };
        }

        private void Render(int width, int height, float shadowDistance, string path)
        {
            RenderTexture rt = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB) { antiAliasing = 1 };
            RenderTexture previous = RenderTexture.active;
            float shadowsBefore = _shadows.GetShadowDistance();
            Texture2D image = new Texture2D(width, height, TextureFormat.RGB24, false);
            try
            {
                _shadows.SetShadowDistance(shadowDistance);
                _camera.targetTexture = rt;
                _camera.aspect = (float)width / height;
                _camera.Render();
                RenderTexture.active = rt;
                image.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                image.Apply();
                File.WriteAllBytes(path, image.EncodeToJPG(90));
            }
            finally
            {
                _shadows.SetShadowDistance(shadowsBefore);
                _camera.targetTexture = null;
                RenderTexture.active = previous;
                rt.Release();
                UnityEngine.Object.Destroy(rt);
                UnityEngine.Object.Destroy(image);
            }
        }
    }
}

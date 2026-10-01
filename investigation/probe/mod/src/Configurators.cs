using Bindito.Core;

namespace DGMProbe
{
    // Nothing is bound unless the probe found a job at start-up.

    [Context("MainMenu")]
    public class ProbeMenuConfigurator : IConfigurator
    {
        public void Configure(IContainerDefinition containerDefinition)
        {
            if (Probe.Active)
            {
                containerDefinition.Bind<MenuDriver>().AsSingleton();
            }
        }
    }

    [Context("Game")]
    public class ProbeGameConfigurator : IConfigurator
    {
        public void Configure(IContainerDefinition containerDefinition)
        {
            if (Probe.Active)
            {
                containerDefinition.Bind<GameDriver>().AsSingleton();
                containerDefinition.Bind<Recorder>().AsSingleton();
                containerDefinition.Bind<WeatherForcer>().AsSingleton();
                containerDefinition.Bind<ShotTaker>().AsSingleton();
                containerDefinition.Bind<PanelCloser>().AsSingleton();
                containerDefinition.Bind<PerfMeter>().AsSingleton();
            }
        }
    }
}

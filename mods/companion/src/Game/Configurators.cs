using Bindito.Core;

namespace DGMCompanion
{
    [Context("MainMenu")]
    public class CompanionMenuConfigurator : IConfigurator
    {
        public void Configure(IContainerDefinition containerDefinition)
        {
            containerDefinition.Bind<MainMenuEntry>().AsSingleton();
            if (CompanionEnv.Testing)
            {
                containerDefinition.Bind<MenuTest>().AsSingleton();
            }
        }
    }

    [Context("Game")]
    public class CompanionGameConfigurator : IConfigurator
    {
        public void Configure(IContainerDefinition containerDefinition)
        {
            containerDefinition.Bind<GameCompanion>().AsSingleton();
            if (CompanionEnv.Testing)
            {
                containerDefinition.Bind<GameTest>().AsSingleton();
            }
        }
    }
}

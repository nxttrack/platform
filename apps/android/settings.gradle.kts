pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "NXTTRACK-Android"

include(
    ":core:domain",
    ":core:data",
    ":core:design",
    ":instructor-app",
    ":parent-app"
)

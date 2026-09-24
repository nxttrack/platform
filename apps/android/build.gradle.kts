plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.jvm) apply false
}

tasks.register("qualityGate") {
    group = "verification"
    description = "Runs both native applications and all shared contract gates."
    dependsOn(
        ":core:domain:test",
        ":core:data:testDebugUnitTest",
        ":core:data:lintDebug",
        ":core:design:testDebugUnitTest",
        ":core:design:lintDebug",
        ":instructor-app:lintDebug",
        ":instructor-app:testDebugUnitTest",
        ":parent-app:lintDebug",
        ":parent-app:testDebugUnitTest"
    )
}

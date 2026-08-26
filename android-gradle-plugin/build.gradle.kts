plugins {
  `java-gradle-plugin`
}

group = "com.mobilediagnosticskit"

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(17))
  }
}

tasks.withType<JavaCompile>().configureEach {
  options.compilerArgs.add("-Xlint:deprecation")
}

dependencies {
  compileOnly("com.android.tools.build:gradle-api:8.5.0")
  implementation("org.ow2.asm:asm:9.7.1")
}

gradlePlugin {
  plugins {
    create("mobileDiagnosticsNetworkCapture") {
      id = "mobile-diagnostics-network-capture"
      implementationClass =
        "com.mobilediagnosticskit.gradle.MobileDiagnosticsNetworkCapturePlugin"
    }
  }
}

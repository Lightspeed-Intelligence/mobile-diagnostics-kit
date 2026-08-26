package com.mobilediagnosticskit.gradle;

import com.android.build.api.instrumentation.FramesComputationMode;
import com.android.build.api.instrumentation.InstrumentationScope;
import com.android.build.api.variant.ApplicationAndroidComponentsExtension;
import com.android.build.api.variant.ApplicationVariant;
import kotlin.Unit;
import org.gradle.api.Action;
import org.gradle.api.Plugin;
import org.gradle.api.Project;

/** Registers passive network capture for every explicitly built Android app variant. */
public final class MobileDiagnosticsNetworkCapturePlugin implements Plugin<Project> {
  @Override
  public void apply(Project project) {
    project.getPlugins().withId("com.android.application", ignored -> {
      ApplicationAndroidComponentsExtension androidComponents =
          project.getExtensions().getByType(ApplicationAndroidComponentsExtension.class);

      androidComponents.onVariants(
          androidComponents.selector().all(),
          (Action<ApplicationVariant>) variant -> {
            variant.getInstrumentation().transformClassesWith(
                NetworkCaptureClassVisitorFactory.class,
                InstrumentationScope.ALL,
                parameters -> Unit.INSTANCE);
            variant.getInstrumentation().setAsmFramesComputationMode(
                FramesComputationMode.COMPUTE_FRAMES_FOR_INSTRUMENTED_METHODS);
          });
    });
  }
}

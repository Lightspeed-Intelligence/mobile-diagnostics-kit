package com.mobilediagnosticskit.gradle;

import com.android.build.api.instrumentation.AsmClassVisitorFactory;
import com.android.build.api.instrumentation.ClassContext;
import com.android.build.api.instrumentation.ClassData;
import com.android.build.api.instrumentation.InstrumentationParameters;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;

/**
 * Adds the diagnostics interceptor to OkHttp clients and redirects HttpURLConnection call sites
 * to semantics-preserving capture helpers. The platform connection implementation is never
 * replaced.
 */
public abstract class NetworkCaptureClassVisitorFactory
    implements AsmClassVisitorFactory<InstrumentationParameters.None> {
  private static final String DIAGNOSTICS_PACKAGE = "com.mobilediagnosticskit.";

  @Override
  public ClassVisitor createClassVisitor(
      ClassContext classContext,
      ClassVisitor nextClassVisitor) {
    return new NetworkCaptureClassVisitor(
        getInstrumentationContext().getApiVersion().get(), nextClassVisitor);
  }

  @Override
  public boolean isInstrumentable(ClassData classData) {
    return !classData.getClassName().startsWith(DIAGNOSTICS_PACKAGE);
  }

  private static final class NetworkCaptureClassVisitor extends ClassVisitor {
    private static final String OKHTTP_CLIENT = "okhttp3/OkHttpClient";
    private static final String OKHTTP_BUILDER = "okhttp3/OkHttpClient$Builder";
    private static final String NATIVE_NETWORK =
        "com/mobilediagnosticskit/MobileDiagnosticsNativeNetwork";
    private static final String URL_CONNECTION_CAPTURE =
        "com/mobilediagnosticskit/MobileDiagnosticsHttpUrlConnectionCapture";
    private static final String URL_CONNECTION = "java/net/URLConnection";
    private static final String HTTP_URL_CONNECTION = "java/net/HttpURLConnection";
    private static final String HTTPS_URL_CONNECTION = "javax/net/ssl/HttpsURLConnection";

    private String className = "";

    NetworkCaptureClassVisitor(int apiVersion, ClassVisitor nextClassVisitor) {
      super(apiVersion, nextClassVisitor);
    }

    @Override
    public void visit(
        int version,
        int access,
        String name,
        String signature,
        String superName,
        String[] interfaces) {
      className = name;
      super.visit(version, access, name, signature, superName, interfaces);
    }

    @Override
    public MethodVisitor visitMethod(
        int access,
        String name,
        String descriptor,
        String signature,
        String[] exceptions) {
      MethodVisitor next = super.visitMethod(access, name, descriptor, signature, exceptions);
      if (next == null) return null;

      boolean installsOkHttpInterceptor =
          OKHTTP_CLIENT.equals(className)
              && "<init>".equals(name)
              && ("(L" + OKHTTP_BUILDER + ";)V").equals(descriptor);

      return new MethodVisitor(api, next) {
        @Override
        public void visitMethodInsn(
            int opcode,
            String owner,
            String invokedName,
            String invokedDescriptor,
            boolean isInterface) {
          if (installsOkHttpInterceptor
              && opcode == Opcodes.INVOKESPECIAL
              && "java/lang/Object".equals(owner)
              && "<init>".equals(invokedName)) {
            super.visitMethodInsn(
                opcode, owner, invokedName, invokedDescriptor, isInterface);
            super.visitVarInsn(Opcodes.ALOAD, 1);
            super.visitMethodInsn(
                Opcodes.INVOKESTATIC,
                NATIVE_NETWORK,
                "install",
                "(L" + OKHTTP_BUILDER + ";)L" + OKHTTP_BUILDER + ";",
                false);
            super.visitInsn(Opcodes.POP);
            return;
          }
          Replacement replacement = Replacement.find(
              opcode, owner, invokedName, invokedDescriptor);
          if (replacement == null) {
            super.visitMethodInsn(
                opcode, owner, invokedName, invokedDescriptor, isInterface);
            return;
          }
          super.visitMethodInsn(
              Opcodes.INVOKESTATIC,
              URL_CONNECTION_CAPTURE,
              replacement.name,
              replacement.descriptor,
              false);
        }
      };
    }

    private enum Replacement {
      CONNECT(
          "replacementForConnect",
          "(Ljava/net/URLConnection;)V",
          "connect",
          "()V",
          URL_CONNECTION,
          HTTP_URL_CONNECTION,
          HTTPS_URL_CONNECTION),
      INPUT_STREAM(
          "replacementForInputStream",
          "(Ljava/net/URLConnection;)Ljava/io/InputStream;",
          "getInputStream",
          "()Ljava/io/InputStream;",
          URL_CONNECTION,
          HTTP_URL_CONNECTION,
          HTTPS_URL_CONNECTION),
      OUTPUT_STREAM(
          "replacementForOutputStream",
          "(Ljava/net/URLConnection;)Ljava/io/OutputStream;",
          "getOutputStream",
          "()Ljava/io/OutputStream;",
          URL_CONNECTION,
          HTTP_URL_CONNECTION,
          HTTPS_URL_CONNECTION),
      RESPONSE_CODE(
          "replacementForResponseCode",
          "(Ljava/net/HttpURLConnection;)I",
          "getResponseCode",
          "()I",
          HTTP_URL_CONNECTION,
          HTTPS_URL_CONNECTION),
      ERROR_STREAM(
          "replacementForErrorStream",
          "(Ljava/net/HttpURLConnection;)Ljava/io/InputStream;",
          "getErrorStream",
          "()Ljava/io/InputStream;",
          HTTP_URL_CONNECTION,
          HTTPS_URL_CONNECTION),
      DISCONNECT(
          "replacementForDisconnect",
          "(Ljava/net/HttpURLConnection;)V",
          "disconnect",
          "()V",
          HTTP_URL_CONNECTION,
          HTTPS_URL_CONNECTION);

      final String name;
      final String descriptor;
      private final String invokedName;
      private final String invokedDescriptor;
      private final String[] owners;

      Replacement(
          String name,
          String descriptor,
          String invokedName,
          String invokedDescriptor,
          String... owners) {
        this.name = name;
        this.descriptor = descriptor;
        this.invokedName = invokedName;
        this.invokedDescriptor = invokedDescriptor;
        this.owners = owners;
      }

      static Replacement find(
          int opcode,
          String owner,
          String name,
          String descriptor) {
        if (opcode != Opcodes.INVOKEVIRTUAL) return null;
        for (Replacement replacement : values()) {
          if (!replacement.invokedName.equals(name)
              || !replacement.invokedDescriptor.equals(descriptor)) {
            continue;
          }
          for (String allowedOwner : replacement.owners) {
            if (allowedOwner.equals(owner)) return replacement;
          }
        }
        return null;
      }
    }
  }
}

module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath:
          'import com.mobilediagnosticskit.MobileDiagnosticsPackage;',
        packageInstance: 'new MobileDiagnosticsPackage()',
      },
      ios: {
        podspecPath: './ios/MobileDiagnosticsKit.podspec',
      },
    },
  },
}

Pod::Spec.new do |s|
  s.name = 'MobileDiagnosticsKit'
  s.version = '0.3.0'
  s.summary = 'Privacy-oriented on-device diagnostics powered by DoKit.'
  s.homepage = 'https://github.com/Lightspeed-Intelligence/mobile-diagnostics-kit'
  s.license = { :type => 'MIT', :file => 'LICENSE' }
  s.author = { 'Mobile Diagnostics Kit contributors' => 'opensource@example.invalid' }
  s.platform = :ios, '15.1'
  s.source = {
    :git => 'https://github.com/Lightspeed-Intelligence/mobile-diagnostics-kit.git',
    :tag => "v#{s.version}"
  }
  s.source_files = 'ios/Sources/**/*.{h,m,mm,swift}'
  s.public_header_files = 'ios/Sources/MobileDiagnostics.h'
  s.requires_arc = true
  s.swift_version = '5.9'
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17'
  }
  s.dependency 'DoraemonKit/Core', '~> 3.1.7'
  s.dependency 'EXUpdates'
  s.dependency 'MMKVCore', '2.2.4'
  s.dependency 'React-Core'
end

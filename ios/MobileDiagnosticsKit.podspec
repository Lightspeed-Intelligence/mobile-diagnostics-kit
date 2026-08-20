Pod::Spec.new do |s|
  s.name = 'MobileDiagnosticsKit'
  s.version = '0.2.0'
  s.summary = 'Privacy-oriented on-device diagnostics powered by DoKit.'
  s.homepage = 'https://github.com/Lightspeed-Intelligence/mobile-diagnostics-kit'
  s.license = { :type => 'MIT', :file => 'LICENSE' }
  s.author = { 'Mobile Diagnostics Kit contributors' => 'opensource@example.invalid' }
  s.platform = :ios, '13.0'
  s.source = {
    :git => 'https://github.com/Lightspeed-Intelligence/mobile-diagnostics-kit.git',
    :tag => "v#{s.version}"
  }
  s.source_files = 'Sources/**/*.{h,m}'
  s.public_header_files = 'Sources/MobileDiagnostics.h'
  s.requires_arc = true
  s.dependency 'DoraemonKit/Core', '~> 3.1.7'
  s.dependency 'React-Core'
end

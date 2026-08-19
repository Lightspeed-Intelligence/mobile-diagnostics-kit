#import "MDKNetworkInspectorViewController.h"

#import <DoraemonKit/DoraemonKit.h>
#import <DoraemonKit/DoraemonCacheManager.h>
#import <DoraemonKit/DoraemonHomeWindow.h>
#import <DoraemonKit/DoraemonNetFlowDataSource.h>
#import <DoraemonKit/DoraemonNetFlowHttpModel.h>
#import <DoraemonKit/DoraemonNetFlowManager.h>

static const CGFloat MDKHorizontalInset = 16.0;

#pragma mark - Theme

static UIColor *MDKRGB(NSUInteger value) {
  return [UIColor colorWithRed:((value >> 16) & 0xff) / 255.0
                         green:((value >> 8) & 0xff) / 255.0
                          blue:(value & 0xff) / 255.0
                         alpha:1.0];
}

static UIColor *MDKDynamic(NSUInteger light, NSUInteger dark) {
  return [UIColor colorWithDynamicProvider:^UIColor *(
                      UITraitCollection *traitCollection) {
    return traitCollection.userInterfaceStyle == UIUserInterfaceStyleDark
               ? MDKRGB(dark)
               : MDKRGB(light);
  }];
}

static UIColor *MDKBackgroundColor(void) {
  return MDKDynamic(0xF8FAFC, 0x0F172A);
}

static UIColor *MDKSurfaceColor(void) {
  return MDKDynamic(0xFFFFFF, 0x1E293B);
}

static UIColor *MDKRaisedColor(void) {
  return MDKDynamic(0xF1F5F9, 0x263449);
}

static UIColor *MDKBorderColor(void) {
  return MDKDynamic(0xCBD5E1, 0x334155);
}

static UIColor *MDKTextColor(void) {
  return MDKDynamic(0x0F172A, 0xF8FAFC);
}

static UIColor *MDKSecondaryTextColor(void) {
  return MDKDynamic(0x475569, 0xCBD5E1);
}

static UIColor *MDKMutedTextColor(void) {
  return MDKDynamic(0x64748B, 0x94A3B8);
}

static UIColor *MDKAccentColor(void) {
  return MDKDynamic(0x15803D, 0x22C55E);
}

static UIColor *MDKMethodColor(NSString *method) {
  NSString *normalized = method.uppercaseString;
  if ([normalized isEqualToString:@"GET"]) {
    return MDKDynamic(0x2563EB, 0x3B82F6);
  }
  if ([normalized isEqualToString:@"POST"]) {
    return MDKDynamic(0x7C3AED, 0xA78BFA);
  }
  if ([normalized isEqualToString:@"PUT"] ||
      [normalized isEqualToString:@"PATCH"]) {
    return MDKDynamic(0xB45309, 0xF59E0B);
  }
  if ([normalized isEqualToString:@"DELETE"]) {
    return MDKDynamic(0xB91C1C, 0xF87171);
  }
  return MDKDynamic(0x475569, 0x64748B);
}

static BOOL MDKParseHTTPStatusCode(NSString *rawStatus, NSInteger *statusCode) {
  NSString *normalized = [rawStatus
      stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if (normalized.length == 0) {
    return NO;
  }

  NSScanner *scanner = [NSScanner scannerWithString:normalized];
  NSInteger parsedStatus = 0;
  if (![scanner scanInteger:&parsedStatus] || !scanner.isAtEnd) {
    return NO;
  }
  if (statusCode) {
    *statusCode = parsedStatus;
  }
  return YES;
}

static UIColor *MDKStatusColor(NSString *statusCode) {
  NSInteger status = 0;
  if (!MDKParseHTTPStatusCode(statusCode, &status)) {
    // DoKit stores transport failures as localized, non-numeric strings.
    return statusCode.length > 0 ? MDKDynamic(0xB91C1C, 0xF87171)
                                 : MDKMutedTextColor();
  }
  if (status >= 200 && status < 300) {
    return MDKDynamic(0x15803D, 0x22C55E);
  }
  if (status >= 300 && status < 400) {
    return MDKDynamic(0x0369A1, 0x38BDF8);
  }
  if (status >= 400 && status < 500) {
    return MDKDynamic(0xB45309, 0xF59E0B);
  }
  if (status >= 500) {
    return MDKDynamic(0xB91C1C, 0xF87171);
  }
  return MDKMutedTextColor();
}

static UIImage *MDKSymbol(NSString *name, CGFloat pointSize) {
  UIImageSymbolConfiguration *configuration =
      [UIImageSymbolConfiguration configurationWithPointSize:pointSize
                                                       weight:UIImageSymbolWeightSemibold];
  return [[UIImage systemImageNamed:name] imageWithConfiguration:configuration];
}

static void MDKStyleCard(UIView *view, CGFloat radius) {
  view.backgroundColor = MDKSurfaceColor();
  view.layer.borderColor = MDKBorderColor().CGColor;
  view.layer.borderWidth = 1.0 / UIScreen.mainScreen.scale;
  view.layer.cornerRadius = radius;
  if (@available(iOS 13.0, *)) {
    view.layer.cornerCurve = kCACornerCurveContinuous;
  }
}

static UIButton *MDKIconButton(NSString *symbol,
                               NSString *accessibilityLabel) {
  UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
  button.translatesAutoresizingMaskIntoConstraints = NO;
  button.backgroundColor = MDKRaisedColor();
  button.tintColor = MDKSecondaryTextColor();
  button.layer.cornerRadius = 22.0;
  if (@available(iOS 13.0, *)) {
    button.layer.cornerCurve = kCACornerCurveContinuous;
  }
  [button setImage:MDKSymbol(symbol, 18.0) forState:UIControlStateNormal];
  button.accessibilityLabel = accessibilityLabel;
  [NSLayoutConstraint activateConstraints:@[
    [button.widthAnchor constraintEqualToConstant:44.0],
    [button.heightAnchor constraintEqualToConstant:44.0],
  ]];
  return button;
}

#pragma mark - Presentation helpers

static NSString *MDKMethod(DoraemonNetFlowHttpModel *model) {
  return model.method.length > 0 ? model.method.uppercaseString : @"HTTP";
}

static NSString *MDKStatus(DoraemonNetFlowHttpModel *model) {
  return model.statusCode.length > 0 ? model.statusCode : @"Pending";
}

static NSURLComponents *MDKURLComponents(DoraemonNetFlowHttpModel *model) {
  return [NSURLComponents componentsWithString:model.url ?: @""];
}

static NSString *MDKHost(DoraemonNetFlowHttpModel *model) {
  NSURLComponents *components = MDKURLComponents(model);
  return components.host.length > 0 ? components.host : @"Unknown host";
}

static NSString *MDKPath(DoraemonNetFlowHttpModel *model) {
  NSURLComponents *components = MDKURLComponents(model);
  NSString *path = components.percentEncodedPath.length > 0
                       ? components.percentEncodedPath
                       : @"/";
  if (components.percentEncodedQuery.length > 0) {
    return [NSString stringWithFormat:@"%@?%@", path,
                                      components.percentEncodedQuery];
  }
  return path;
}

static NSString *MDKFormatBytes(double bytes) {
  if (bytes >= 1024.0 * 1024.0) {
    return [NSString stringWithFormat:@"%.1f MB", bytes / (1024.0 * 1024.0)];
  }
  if (bytes >= 1024.0) {
    return [NSString stringWithFormat:@"%.1f KB", bytes / 1024.0];
  }
  return [NSString stringWithFormat:@"%.0f B", MAX(0.0, bytes)];
}

static NSString *MDKDuration(DoraemonNetFlowHttpModel *model) {
  double seconds = model.totalDuration.doubleValue;
  if (seconds <= 0.0 && model.endTime > model.startTime) {
    seconds = model.endTime - model.startTime;
  }
  if (seconds <= 0.0) {
    return @"—";
  }
  if (seconds < 1.0) {
    return [NSString stringWithFormat:@"%.0f ms", seconds * 1000.0];
  }
  return [NSString stringWithFormat:@"%.2f s", seconds];
}

static NSString *MDKStartTime(DoraemonNetFlowHttpModel *model) {
  if (model.startTime <= 0.0) {
    return @"—";
  }
  static NSDateFormatter *formatter;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    formatter = [[NSDateFormatter alloc] init];
    formatter.locale = [[NSLocale alloc] initWithLocaleIdentifier:@"en_US_POSIX"];
    formatter.dateFormat = @"HH:mm:ss";
  });
  return [formatter stringFromDate:
                        [NSDate dateWithTimeIntervalSince1970:model.startTime]];
}

static NSString *MDKMetadata(DoraemonNetFlowHttpModel *model) {
  return [NSString
      stringWithFormat:@"%@  ·  ↑ %@  ·  ↓ %@  ·  %@", MDKDuration(model),
                       MDKFormatBytes(model.uploadFlow.doubleValue),
                       MDKFormatBytes(model.downFlow.doubleValue),
                       MDKStartTime(model)];
}

static NSString *MDKHeadersText(NSDictionary *headers) {
  if (headers.count == 0) {
    return @"No headers";
  }
  NSArray *keys = [headers.allKeys
      sortedArrayUsingComparator:^NSComparisonResult(id left, id right) {
        return [[left description]
            localizedCaseInsensitiveCompare:[right description]];
      }];
  NSMutableArray<NSString *> *lines = [NSMutableArray arrayWithCapacity:keys.count];
  for (id key in keys) {
    id value = headers[key];
    [lines addObject:[NSString stringWithFormat:@"%@: %@", [key description],
                                                [value description]]];
  }
  return [lines componentsJoinedByString:@"\n"];
}

static NSString *MDKPrettyBody(NSString *body) {
  if (body.length == 0) {
    return @"No body";
  }
  NSString *presented = body;
  NSData *data = [body dataUsingEncoding:NSUTF8StringEncoding];
  if (data.length > 0) {
    id object = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    if (object && [NSJSONSerialization isValidJSONObject:object]) {
      NSData *pretty = [NSJSONSerialization dataWithJSONObject:object
                                                       options:NSJSONWritingPrettyPrinted
                                                         error:nil];
      NSString *prettyString =
          [[NSString alloc] initWithData:pretty encoding:NSUTF8StringEncoding];
      if (prettyString.length > 0) {
        presented = prettyString;
      }
    }
  }
  static const NSUInteger maximumCharacters = 120000;
  if (presented.length > maximumCharacters) {
    return [[presented substringToIndex:maximumCharacters]
        stringByAppendingString:@"\n\n… truncated for on-device display"];
  }
  return presented;
}

static NSString *MDKResponseBodyDisplay(DoraemonNetFlowHttpModel *model) {
  if (model.responseBody.length > 0) {
    return MDKPrettyBody(model.responseBody);
  }
  if (model.responseData.length > 0) {
    NSString *mimeType = model.mineType.length > 0 ? model.mineType
                                                    : @"unknown MIME type";
    return [NSString
        stringWithFormat:@"Binary response body · %lu bytes · %@\nText preview is unavailable.",
                         (unsigned long)model.responseData.length, mimeType];
  }
  return @"No body";
}

static BOOL MDKIsError(DoraemonNetFlowHttpModel *model) {
  NSInteger status = 0;
  return !MDKParseHTTPStatusCode(model.statusCode, &status) || status <= 0 ||
         status >= 400;
}

#pragma mark - Request cell

@interface MDKNetworkRequestCell : UITableViewCell

- (void)renderModel:(DoraemonNetFlowHttpModel *)model;

@end

@interface MDKNetworkRequestCell ()

@property(nonatomic, strong) UIView *cardView;
@property(nonatomic, strong) UILabel *methodLabel;
@property(nonatomic, strong) UILabel *statusLabel;
@property(nonatomic, strong) UILabel *hostLabel;
@property(nonatomic, strong) UILabel *pathLabel;
@property(nonatomic, strong) UILabel *metadataLabel;

@end


@implementation MDKNetworkRequestCell

- (instancetype)initWithStyle:(UITableViewCellStyle)style
               reuseIdentifier:(NSString *)reuseIdentifier {
  self = [super initWithStyle:style reuseIdentifier:reuseIdentifier];
  if (!self) {
    return nil;
  }

  self.backgroundColor = UIColor.clearColor;
  self.selectionStyle = UITableViewCellSelectionStyleNone;

  _cardView = [[UIView alloc] init];
  _cardView.translatesAutoresizingMaskIntoConstraints = NO;
  MDKStyleCard(_cardView, 14.0);
  [self.contentView addSubview:_cardView];

  _methodLabel = [[UILabel alloc] init];
  _methodLabel.translatesAutoresizingMaskIntoConstraints = NO;
  _methodLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleCaption1];
  _methodLabel.adjustsFontForContentSizeCategory = YES;
  _methodLabel.textColor = UIColor.whiteColor;
  _methodLabel.textAlignment = NSTextAlignmentCenter;
  _methodLabel.layer.cornerRadius = 6.0;
  _methodLabel.layer.masksToBounds = YES;
  [_methodLabel setContentCompressionResistancePriority:UILayoutPriorityRequired
                                               forAxis:UILayoutConstraintAxisHorizontal];
  [_methodLabel setContentHuggingPriority:UILayoutPriorityRequired
                                  forAxis:UILayoutConstraintAxisHorizontal];

  _statusLabel = [[UILabel alloc] init];
  _statusLabel.translatesAutoresizingMaskIntoConstraints = NO;
  _statusLabel.font = [UIFont monospacedDigitSystemFontOfSize:12.0
                                                       weight:UIFontWeightSemibold];
  _statusLabel.adjustsFontForContentSizeCategory = YES;
  [_statusLabel setContentCompressionResistancePriority:UILayoutPriorityRequired
                                               forAxis:UILayoutConstraintAxisHorizontal];

  _hostLabel = [[UILabel alloc] init];
  _hostLabel.translatesAutoresizingMaskIntoConstraints = NO;
  _hostLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleCaption1];
  _hostLabel.adjustsFontForContentSizeCategory = YES;
  _hostLabel.textColor = MDKMutedTextColor();
  _hostLabel.lineBreakMode = NSLineBreakByTruncatingMiddle;

  UIStackView *topRow =
      [[UIStackView alloc] initWithArrangedSubviews:@[_methodLabel, _statusLabel,
                                                     _hostLabel]];
  topRow.translatesAutoresizingMaskIntoConstraints = NO;
  topRow.axis = UILayoutConstraintAxisHorizontal;
  topRow.alignment = UIStackViewAlignmentCenter;
  topRow.spacing = 8.0;

  _pathLabel = [[UILabel alloc] init];
  _pathLabel.translatesAutoresizingMaskIntoConstraints = NO;
  _pathLabel.font = [UIFont monospacedSystemFontOfSize:14.0
                                                weight:UIFontWeightSemibold];
  _pathLabel.adjustsFontForContentSizeCategory = YES;
  _pathLabel.textColor = MDKTextColor();
  _pathLabel.numberOfLines = 2;
  _pathLabel.lineBreakMode = NSLineBreakByTruncatingMiddle;

  _metadataLabel = [[UILabel alloc] init];
  _metadataLabel.translatesAutoresizingMaskIntoConstraints = NO;
  _metadataLabel.font = [UIFont monospacedDigitSystemFontOfSize:11.0
                                                         weight:UIFontWeightRegular];
  _metadataLabel.adjustsFontForContentSizeCategory = YES;
  _metadataLabel.textColor = MDKSecondaryTextColor();
  _metadataLabel.numberOfLines = 1;
  _metadataLabel.minimumScaleFactor = 0.8;
  _metadataLabel.adjustsFontSizeToFitWidth = YES;

  UIImageView *disclosure =
      [[UIImageView alloc] initWithImage:MDKSymbol(@"chevron.right", 12.0)];
  disclosure.translatesAutoresizingMaskIntoConstraints = NO;
  disclosure.tintColor = MDKMutedTextColor();
  [disclosure setContentCompressionResistancePriority:UILayoutPriorityRequired
                                              forAxis:UILayoutConstraintAxisHorizontal];

  UIStackView *copy = [[UIStackView alloc]
      initWithArrangedSubviews:@[topRow, _pathLabel, _metadataLabel]];
  copy.translatesAutoresizingMaskIntoConstraints = NO;
  copy.axis = UILayoutConstraintAxisVertical;
  copy.spacing = 8.0;

  [_cardView addSubview:copy];
  [_cardView addSubview:disclosure];

  [NSLayoutConstraint activateConstraints:@[
    [_cardView.topAnchor constraintEqualToAnchor:self.contentView.topAnchor
                                         constant:5.0],
    [_cardView.leadingAnchor constraintEqualToAnchor:self.contentView.leadingAnchor
                                             constant:MDKHorizontalInset],
    [_cardView.trailingAnchor constraintEqualToAnchor:self.contentView.trailingAnchor
                                              constant:-MDKHorizontalInset],
    [_cardView.bottomAnchor constraintEqualToAnchor:self.contentView.bottomAnchor
                                            constant:-5.0],
    [copy.topAnchor constraintEqualToAnchor:_cardView.topAnchor constant:13.0],
    [copy.leadingAnchor constraintEqualToAnchor:_cardView.leadingAnchor
                                        constant:13.0],
    [copy.trailingAnchor constraintEqualToAnchor:disclosure.leadingAnchor
                                         constant:-10.0],
    [copy.bottomAnchor constraintEqualToAnchor:_cardView.bottomAnchor
                                       constant:-13.0],
    [disclosure.centerYAnchor constraintEqualToAnchor:_cardView.centerYAnchor],
    [disclosure.trailingAnchor constraintEqualToAnchor:_cardView.trailingAnchor
                                               constant:-12.0],
    [disclosure.widthAnchor constraintEqualToConstant:12.0],
    [_methodLabel.heightAnchor constraintGreaterThanOrEqualToConstant:24.0],
    [_methodLabel.widthAnchor constraintGreaterThanOrEqualToConstant:54.0],
  ]];

  return self;
}

- (void)renderModel:(DoraemonNetFlowHttpModel *)model {
  NSString *method = MDKMethod(model);
  NSString *status = MDKStatus(model);
  _methodLabel.text = method;
  _methodLabel.backgroundColor = MDKMethodColor(method);
  _statusLabel.text = status;
  _statusLabel.textColor = MDKStatusColor(model.statusCode);
  _hostLabel.text = MDKHost(model);
  _pathLabel.text = MDKPath(model);
  _metadataLabel.text = MDKMetadata(model);
  self.accessibilityLabel =
      [NSString stringWithFormat:@"%@ %@, status %@, %@, %@", method,
                                 MDKPath(model), status, MDKHost(model),
                                 MDKMetadata(model)];
  self.accessibilityIdentifier = [NSString
      stringWithFormat:@"mobileDiagnostics.network.request.%@",
                       model.requestId.length > 0 ? model.requestId : @"item"];
  self.accessibilityTraits = UIAccessibilityTraitButton;
}

- (void)setHighlighted:(BOOL)highlighted animated:(BOOL)animated {
  [super setHighlighted:highlighted animated:animated];
  void (^changes)(void) = ^{
    self.cardView.alpha = highlighted ? 0.72 : 1.0;
  };
  if (animated) {
    [UIView animateWithDuration:0.12 animations:changes];
  } else {
    changes();
  }
}

@end

#pragma mark - Detail section

@interface MDKNetworkDetailSectionView : UIView

- (instancetype)initWithTitle:(NSString *)title
               displayContent:(NSString *)displayContent
                  copyContent:(NSString *)copyContent;

@end


@interface MDKNetworkDetailSectionView ()

@property(nonatomic, copy) NSString *contentToCopy;

@end


@implementation MDKNetworkDetailSectionView

- (instancetype)initWithTitle:(NSString *)title
               displayContent:(NSString *)displayContent
                  copyContent:(NSString *)copyContent {
  self = [super initWithFrame:CGRectZero];
  if (!self) {
    return nil;
  }
  self.translatesAutoresizingMaskIntoConstraints = NO;
  self.contentToCopy = copyContent;
  MDKStyleCard(self, 14.0);

  UILabel *titleLabel = [[UILabel alloc] init];
  titleLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleSubheadline];
  titleLabel.adjustsFontForContentSizeCategory = YES;
  titleLabel.textColor = MDKTextColor();
  titleLabel.text = title;

  UIButton *copyButton = MDKIconButton(@"doc.on.doc", [NSString
      stringWithFormat:@"Copy %@", title.lowercaseString]);
  copyButton.backgroundColor = UIColor.clearColor;
  copyButton.hidden = copyContent.length == 0;
  [copyButton addTarget:self
                 action:@selector(copyContentToPasteboard)
       forControlEvents:UIControlEventTouchUpInside];

  UIStackView *heading =
      [[UIStackView alloc] initWithArrangedSubviews:@[titleLabel, copyButton]];
  heading.axis = UILayoutConstraintAxisHorizontal;
  heading.alignment = UIStackViewAlignmentCenter;

  UITextView *contentView = [[UITextView alloc] init];
  contentView.translatesAutoresizingMaskIntoConstraints = NO;
  contentView.backgroundColor = UIColor.clearColor;
  contentView.editable = NO;
  contentView.scrollEnabled = NO;
  contentView.selectable = YES;
  contentView.textContainerInset = UIEdgeInsetsZero;
  contentView.textContainer.lineFragmentPadding = 0.0;
  contentView.font = [UIFont monospacedSystemFontOfSize:12.0
                                                 weight:UIFontWeightRegular];
  contentView.adjustsFontForContentSizeCategory = YES;
  contentView.textColor = MDKSecondaryTextColor();
  contentView.text = displayContent;

  UIStackView *stack =
      [[UIStackView alloc] initWithArrangedSubviews:@[heading, contentView]];
  stack.translatesAutoresizingMaskIntoConstraints = NO;
  stack.axis = UILayoutConstraintAxisVertical;
  stack.spacing = 10.0;
  [self addSubview:stack];

  [NSLayoutConstraint activateConstraints:@[
    [stack.topAnchor constraintEqualToAnchor:self.topAnchor constant:13.0],
    [stack.leadingAnchor constraintEqualToAnchor:self.leadingAnchor constant:13.0],
    [stack.trailingAnchor constraintEqualToAnchor:self.trailingAnchor constant:-13.0],
    [stack.bottomAnchor constraintEqualToAnchor:self.bottomAnchor constant:-13.0],
  ]];
  return self;
}

- (void)copyContentToPasteboard {
  if (self.contentToCopy.length == 0) {
    return;
  }
  UIPasteboard.generalPasteboard.string = self.contentToCopy;
  UIAccessibilityPostNotification(UIAccessibilityAnnouncementNotification,
                                  @"Copied");
}

@end

#pragma mark - Detail controller

@interface MDKNetworkDetailViewController : UIViewController

- (instancetype)initWithModel:(DoraemonNetFlowHttpModel *)model;

@end


@interface MDKNetworkDetailViewController ()

@property(nonatomic, strong) DoraemonNetFlowHttpModel *model;
@property(nonatomic, strong) UIStackView *sectionsStack;
@property(nonatomic, strong) UISegmentedControl *segmentControl;

@end


@implementation MDKNetworkDetailViewController

- (instancetype)initWithModel:(DoraemonNetFlowHttpModel *)model {
  self = [super initWithNibName:nil bundle:nil];
  if (self) {
    _model = model;
  }
  return self;
}

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = MDKBackgroundColor();
  self.view.accessibilityIdentifier = @"mobileDiagnostics.network.detail.screen";
  [self buildInterface];
  [self renderSections];
}

- (void)viewWillAppear:(BOOL)animated {
  [super viewWillAppear:animated];
  [[DoraemonManager shareInstance] hiddenDoraemon];
  [self.navigationController setNavigationBarHidden:YES animated:animated];
}

- (void)buildInterface {
  UIScrollView *scrollView = [[UIScrollView alloc] init];
  scrollView.translatesAutoresizingMaskIntoConstraints = NO;
  scrollView.backgroundColor = MDKBackgroundColor();
  scrollView.alwaysBounceVertical = YES;
  scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
  [self.view addSubview:scrollView];

  UIStackView *content = [[UIStackView alloc] init];
  content.translatesAutoresizingMaskIntoConstraints = NO;
  content.axis = UILayoutConstraintAxisVertical;
  content.spacing = 12.0;
  [scrollView addSubview:content];

  UIButton *backButton = MDKIconButton(@"chevron.left", @"Back to Network list");
  [backButton addTarget:self
                 action:@selector(goBack)
       forControlEvents:UIControlEventTouchUpInside];

  UILabel *title = [[UILabel alloc] init];
  title.font = [UIFont preferredFontForTextStyle:UIFontTextStyleTitle2];
  title.adjustsFontForContentSizeCategory = YES;
  title.textColor = MDKTextColor();
  title.text = @"Request details";

  UIView *spacer = [[UIView alloc] init];
  UIStackView *header =
      [[UIStackView alloc] initWithArrangedSubviews:@[backButton, title, spacer]];
  header.axis = UILayoutConstraintAxisHorizontal;
  header.alignment = UIStackViewAlignmentCenter;
  header.spacing = 12.0;
  [spacer setContentHuggingPriority:UILayoutPriorityDefaultLow
                           forAxis:UILayoutConstraintAxisHorizontal];

  UIView *summary = [self makeSummaryCard];

  _segmentControl = [[UISegmentedControl alloc]
      initWithItems:@[ @"Request", @"Response" ]];
  _segmentControl.selectedSegmentIndex = 0;
  _segmentControl.selectedSegmentTintColor = MDKSurfaceColor();
  _segmentControl.backgroundColor = MDKRaisedColor();
  _segmentControl.accessibilityLabel = @"Request or response";
  _segmentControl.accessibilityIdentifier =
      @"mobileDiagnostics.network.detail.segmentControl";
  [_segmentControl addTarget:self
                      action:@selector(renderSections)
            forControlEvents:UIControlEventValueChanged];
  [_segmentControl.heightAnchor constraintGreaterThanOrEqualToConstant:44.0].active = YES;

  _sectionsStack = [[UIStackView alloc] init];
  _sectionsStack.axis = UILayoutConstraintAxisVertical;
  _sectionsStack.spacing = 12.0;

  [content addArrangedSubview:header];
  [content addArrangedSubview:summary];
  [content addArrangedSubview:_segmentControl];
  [content addArrangedSubview:_sectionsStack];
  [content setCustomSpacing:18.0 afterView:header];

  UILayoutGuide *safeArea = self.view.safeAreaLayoutGuide;
  [NSLayoutConstraint activateConstraints:@[
    [scrollView.topAnchor constraintEqualToAnchor:safeArea.topAnchor],
    [scrollView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
    [scrollView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    [scrollView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
    [content.topAnchor constraintEqualToAnchor:scrollView.contentLayoutGuide.topAnchor
                                      constant:12.0],
    [content.leadingAnchor
        constraintEqualToAnchor:scrollView.contentLayoutGuide.leadingAnchor
                       constant:MDKHorizontalInset],
    [content.trailingAnchor
        constraintEqualToAnchor:scrollView.contentLayoutGuide.trailingAnchor
                       constant:-MDKHorizontalInset],
    [content.bottomAnchor constraintEqualToAnchor:scrollView.contentLayoutGuide.bottomAnchor
                                          constant:-28.0],
    [content.widthAnchor
        constraintEqualToAnchor:scrollView.frameLayoutGuide.widthAnchor
                       constant:-(MDKHorizontalInset * 2.0)],
  ]];
}

- (UIView *)makeSummaryCard {
  UIView *card = [[UIView alloc] init];
  MDKStyleCard(card, 16.0);

  UILabel *method = [[UILabel alloc] init];
  method.font = [UIFont preferredFontForTextStyle:UIFontTextStyleCaption1];
  method.adjustsFontForContentSizeCategory = YES;
  method.textAlignment = NSTextAlignmentCenter;
  method.textColor = UIColor.whiteColor;
  method.backgroundColor = MDKMethodColor(MDKMethod(self.model));
  method.layer.cornerRadius = 6.0;
  method.layer.masksToBounds = YES;
  method.text = MDKMethod(self.model);
  [method.widthAnchor constraintGreaterThanOrEqualToConstant:54.0].active = YES;
  [method.heightAnchor constraintGreaterThanOrEqualToConstant:24.0].active = YES;

  UILabel *status = [[UILabel alloc] init];
  status.font = [UIFont monospacedDigitSystemFontOfSize:13.0
                                                  weight:UIFontWeightBold];
  status.adjustsFontForContentSizeCategory = YES;
  status.textColor = MDKStatusColor(self.model.statusCode);
  status.text = MDKStatus(self.model);

  UIView *topSpacer = [[UIView alloc] init];
  UIStackView *top =
      [[UIStackView alloc] initWithArrangedSubviews:@[method, status, topSpacer]];
  top.axis = UILayoutConstraintAxisHorizontal;
  top.alignment = UIStackViewAlignmentCenter;
  top.spacing = 9.0;

  UILabel *host = [[UILabel alloc] init];
  host.font = [UIFont preferredFontForTextStyle:UIFontTextStyleCaption1];
  host.adjustsFontForContentSizeCategory = YES;
  host.textColor = MDKMutedTextColor();
  host.text = MDKHost(self.model);

  UILabel *path = [[UILabel alloc] init];
  path.font = [UIFont monospacedSystemFontOfSize:14.0 weight:UIFontWeightSemibold];
  path.adjustsFontForContentSizeCategory = YES;
  path.textColor = MDKTextColor();
  path.numberOfLines = 0;
  path.text = MDKPath(self.model);

  UILabel *metadata = [[UILabel alloc] init];
  metadata.font = [UIFont monospacedDigitSystemFontOfSize:11.0
                                                    weight:UIFontWeightRegular];
  metadata.adjustsFontForContentSizeCategory = YES;
  metadata.textColor = MDKSecondaryTextColor();
  metadata.numberOfLines = 0;
  metadata.text = MDKMetadata(self.model);

  UIStackView *stack =
      [[UIStackView alloc] initWithArrangedSubviews:@[top, host, path, metadata]];
  stack.translatesAutoresizingMaskIntoConstraints = NO;
  stack.axis = UILayoutConstraintAxisVertical;
  stack.spacing = 8.0;
  [card addSubview:stack];
  [NSLayoutConstraint activateConstraints:@[
    [stack.topAnchor constraintEqualToAnchor:card.topAnchor constant:14.0],
    [stack.leadingAnchor constraintEqualToAnchor:card.leadingAnchor constant:14.0],
    [stack.trailingAnchor constraintEqualToAnchor:card.trailingAnchor constant:-14.0],
    [stack.bottomAnchor constraintEqualToAnchor:card.bottomAnchor constant:-14.0],
  ]];
  return card;
}

- (void)renderSections {
  for (UIView *view in self.sectionsStack.arrangedSubviews.copy) {
    [self.sectionsStack removeArrangedSubview:view];
    [view removeFromSuperview];
  }

  NSArray<NSDictionary<NSString *, NSString *> *> *sections;
  if (self.segmentControl.selectedSegmentIndex == 0) {
    NSString *url = self.model.url ?: @"";
    NSString *headers = MDKHeadersText(self.model.request.allHTTPHeaderFields);
    NSString *body = self.model.requestBody ?: @"";
    sections = @[
      @{ @"title" : @"Full URL",
         @"display" : url.length > 0 ? url : @"No URL",
         @"copy" : url },
      @{ @"title" : @"Headers", @"display" : headers, @"copy" : headers },
      @{ @"title" : @"Body",
         @"display" : MDKPrettyBody(body),
         @"copy" : body },
    ];
  } else {
    NSDictionary *responseHeaders = @{};
    if ([self.model.response isKindOfClass:NSHTTPURLResponse.class]) {
      responseHeaders = ((NSHTTPURLResponse *)self.model.response).allHeaderFields;
    }
    NSString *headers = MDKHeadersText(responseHeaders);
    NSString *body = self.model.responseBody ?: @"";
    sections = @[
      @{ @"title" : @"Headers", @"display" : headers, @"copy" : headers },
      @{ @"title" : @"Body",
         @"display" : MDKResponseBodyDisplay(self.model),
         @"copy" : body },
    ];
  }

  for (NSDictionary<NSString *, NSString *> *section in sections) {
    MDKNetworkDetailSectionView *sectionView =
        [[MDKNetworkDetailSectionView alloc] initWithTitle:section[@"title"]
                                           displayContent:section[@"display"]
                                              copyContent:section[@"copy"]];
    [self.sectionsStack addArrangedSubview:sectionView];
  }
}

- (void)goBack {
  [self.navigationController popViewControllerAnimated:YES];
}

@end

#pragma mark - Network list controller

@interface MDKNetworkInspectorViewController ()
    <UITableViewDataSource, UITableViewDelegate, UITextFieldDelegate>

@property(nonatomic, strong) UITableView *tableView;
@property(nonatomic, strong) UISearchTextField *searchField;
@property(nonatomic, strong) UISegmentedControl *filterControl;
@property(nonatomic, strong) UILabel *requestCountLabel;
@property(nonatomic, strong) UILabel *errorCountLabel;
@property(nonatomic, strong) UILabel *receivedBytesLabel;
@property(nonatomic, strong) UISwitch *captureSwitch;
@property(nonatomic, copy) NSArray<DoraemonNetFlowHttpModel *> *allRequests;
@property(nonatomic, copy) NSArray<DoraemonNetFlowHttpModel *> *visibleRequests;

@end


@implementation MDKNetworkInspectorViewController

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = MDKBackgroundColor();
  self.view.accessibilityIdentifier = @"mobileDiagnostics.network.screen";
  self.allRequests = @[];
  self.visibleRequests = @[];
  [self buildInterface];
  [self refreshRequests];

  [[NSNotificationCenter defaultCenter]
      addObserver:self
         selector:@selector(contentSizeCategoryDidChange)
             name:UIContentSizeCategoryDidChangeNotification
           object:nil];
}

- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)viewWillAppear:(BOOL)animated {
  [super viewWillAppear:animated];
  [[DoraemonManager shareInstance] hiddenDoraemon];
  [self.navigationController setNavigationBarHidden:YES animated:animated];
  [self refreshRequests];
}

- (void)buildInterface {
  UIButton *backButton = MDKIconButton(@"chevron.left", @"Back to DoKit");
  backButton.accessibilityIdentifier = @"mobileDiagnostics.network.backButton";
  [backButton addTarget:self
                 action:@selector(showDoKitHome)
       forControlEvents:UIControlEventTouchUpInside];

  UILabel *eyebrow = [[UILabel alloc] init];
  eyebrow.font = [UIFont preferredFontForTextStyle:UIFontTextStyleCaption2];
  eyebrow.adjustsFontForContentSizeCategory = YES;
  eyebrow.textColor = MDKAccentColor();
  eyebrow.text = @"ON-DEVICE DIAGNOSTICS";

  UILabel *title = [[UILabel alloc] init];
  title.font = [UIFont preferredFontForTextStyle:UIFontTextStyleTitle2];
  title.adjustsFontForContentSizeCategory = YES;
  title.textColor = MDKTextColor();
  title.text = @"Network";

  UIStackView *titleCopy =
      [[UIStackView alloc] initWithArrangedSubviews:@[eyebrow, title]];
  titleCopy.axis = UILayoutConstraintAxisVertical;
  titleCopy.spacing = 2.0;

  UIButton *refreshButton = MDKIconButton(@"arrow.clockwise", @"Refresh requests");
  refreshButton.accessibilityIdentifier = @"mobileDiagnostics.network.refreshButton";
  [refreshButton addTarget:self
                    action:@selector(refreshRequests)
          forControlEvents:UIControlEventTouchUpInside];

  UIStackView *header = [[UIStackView alloc]
      initWithArrangedSubviews:@[backButton, titleCopy, refreshButton]];
  header.axis = UILayoutConstraintAxisHorizontal;
  header.alignment = UIStackViewAlignmentCenter;
  header.spacing = 12.0;

  UIView *summary = [self makeSummaryCard];
  summary.accessibilityLabel = @"Network summary";
  summary.accessibilityIdentifier = @"mobileDiagnostics.network.summaryView";

  _searchField = [[UISearchTextField alloc] init];
  _searchField.translatesAutoresizingMaskIntoConstraints = NO;
  _searchField.backgroundColor = MDKSurfaceColor();
  _searchField.textColor = MDKTextColor();
  _searchField.tintColor = MDKAccentColor();
  _searchField.font = [UIFont preferredFontForTextStyle:UIFontTextStyleBody];
  _searchField.adjustsFontForContentSizeCategory = YES;
  _searchField.placeholder = @"Search host, path, method, or status";
  _searchField.accessibilityIdentifier = @"mobileDiagnostics.network.searchField";
  _searchField.layer.cornerRadius = 12.0;
  _searchField.layer.borderWidth = 1.0 / UIScreen.mainScreen.scale;
  _searchField.layer.borderColor = MDKBorderColor().CGColor;
  if (@available(iOS 13.0, *)) {
    _searchField.layer.cornerCurve = kCACornerCurveContinuous;
  }
  [_searchField addTarget:self
                   action:@selector(applyFilter)
         forControlEvents:UIControlEventEditingChanged];
  [_searchField.heightAnchor constraintGreaterThanOrEqualToConstant:48.0].active = YES;

  _filterControl = [[UISegmentedControl alloc]
      initWithItems:@[ @"All requests", @"Errors" ]];
  _filterControl.selectedSegmentIndex = 0;
  _filterControl.selectedSegmentTintColor = MDKSurfaceColor();
  _filterControl.backgroundColor = MDKRaisedColor();
  _filterControl.accessibilityIdentifier = @"mobileDiagnostics.network.filterControl";
  [_filterControl addTarget:self
                     action:@selector(applyFilter)
           forControlEvents:UIControlEventValueChanged];
  [_filterControl.heightAnchor constraintGreaterThanOrEqualToConstant:40.0].active = YES;

  UIStackView *controls = [[UIStackView alloc]
      initWithArrangedSubviews:@[header, summary, _searchField, _filterControl]];
  controls.translatesAutoresizingMaskIntoConstraints = NO;
  controls.axis = UILayoutConstraintAxisVertical;
  controls.spacing = 10.0;
  [self.view addSubview:controls];

  _tableView = [[UITableView alloc] initWithFrame:CGRectZero
                                             style:UITableViewStylePlain];
  _tableView.translatesAutoresizingMaskIntoConstraints = NO;
  _tableView.backgroundColor = MDKBackgroundColor();
  _tableView.separatorStyle = UITableViewCellSeparatorStyleNone;
  _tableView.dataSource = self;
  _tableView.delegate = self;
  _tableView.keyboardDismissMode = UIScrollViewKeyboardDismissModeOnDrag;
  _tableView.rowHeight = UITableViewAutomaticDimension;
  _tableView.estimatedRowHeight = 124.0;
  _tableView.contentInset = UIEdgeInsetsMake(4.0, 0.0, 22.0, 0.0);
  _tableView.accessibilityLabel = @"Network list";
  _tableView.accessibilityIdentifier = @"mobileDiagnostics.network.list";
  [_tableView registerClass:MDKNetworkRequestCell.class
     forCellReuseIdentifier:@"MDKNetworkRequestCell"];

  UIRefreshControl *refreshControl = [[UIRefreshControl alloc] init];
  refreshControl.tintColor = MDKAccentColor();
  [refreshControl addTarget:self
                     action:@selector(refreshRequests)
           forControlEvents:UIControlEventValueChanged];
  _tableView.refreshControl = refreshControl;
  [self.view addSubview:_tableView];

  [NSLayoutConstraint activateConstraints:@[
    [controls.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor
                                        constant:10.0],
    [controls.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor
                                            constant:MDKHorizontalInset],
    [controls.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor
                                             constant:-MDKHorizontalInset],
    [_tableView.topAnchor constraintEqualToAnchor:controls.bottomAnchor constant:8.0],
    [_tableView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
    [_tableView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    [_tableView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
  ]];
}

- (UIView *)makeSummaryCard {
  UIView *card = [[UIView alloc] init];
  card.translatesAutoresizingMaskIntoConstraints = NO;
  MDKStyleCard(card, 14.0);

  UIStackView *requests =
      [self metricWithTitle:@"Requests" valueLabel:&_requestCountLabel];
  UIStackView *errors = [self metricWithTitle:@"Errors" valueLabel:&_errorCountLabel];
  UIStackView *received =
      [self metricWithTitle:@"Received" valueLabel:&_receivedBytesLabel];

  _captureSwitch = [[UISwitch alloc] init];
  _captureSwitch.onTintColor = MDKAccentColor();
  _captureSwitch.on = [[DoraemonCacheManager sharedInstance] netFlowSwitch];
  _captureSwitch.accessibilityLabel = @"Capture network requests";
  _captureSwitch.accessibilityIdentifier = @"mobileDiagnostics.network.captureSwitch";
  [_captureSwitch addTarget:self
                     action:@selector(captureSwitchChanged)
           forControlEvents:UIControlEventValueChanged];

  UILabel *captureTitle = [[UILabel alloc] init];
  captureTitle.font = [UIFont preferredFontForTextStyle:UIFontTextStyleCaption2];
  captureTitle.adjustsFontForContentSizeCategory = YES;
  captureTitle.textColor = MDKMutedTextColor();
  captureTitle.text = @"Capture";
  captureTitle.textAlignment = NSTextAlignmentCenter;
  UIStackView *capture =
      [[UIStackView alloc] initWithArrangedSubviews:@[_captureSwitch, captureTitle]];
  capture.axis = UILayoutConstraintAxisVertical;
  capture.alignment = UIStackViewAlignmentCenter;
  capture.spacing = 3.0;

  UIStackView *metrics = [[UIStackView alloc]
      initWithArrangedSubviews:@[requests, errors, received, capture]];
  metrics.translatesAutoresizingMaskIntoConstraints = NO;
  metrics.axis = UILayoutConstraintAxisHorizontal;
  metrics.alignment = UIStackViewAlignmentCenter;
  metrics.distribution = UIStackViewDistributionFillEqually;
  [card addSubview:metrics];
  [NSLayoutConstraint activateConstraints:@[
    [metrics.topAnchor constraintEqualToAnchor:card.topAnchor constant:10.0],
    [metrics.leadingAnchor constraintEqualToAnchor:card.leadingAnchor constant:8.0],
    [metrics.trailingAnchor constraintEqualToAnchor:card.trailingAnchor constant:-8.0],
    [metrics.bottomAnchor constraintEqualToAnchor:card.bottomAnchor constant:-10.0],
    [card.heightAnchor constraintGreaterThanOrEqualToConstant:76.0],
  ]];
  return card;
}

- (UIStackView *)metricWithTitle:(NSString *)title
                      valueLabel:(UILabel *__strong *)valueLabel {
  UILabel *value = [[UILabel alloc] init];
  value.font = [UIFont monospacedDigitSystemFontOfSize:16.0
                                                 weight:UIFontWeightBold];
  value.adjustsFontForContentSizeCategory = YES;
  value.textColor = MDKTextColor();
  value.textAlignment = NSTextAlignmentCenter;
  value.text = @"0";
  *valueLabel = value;

  UILabel *caption = [[UILabel alloc] init];
  caption.font = [UIFont preferredFontForTextStyle:UIFontTextStyleCaption2];
  caption.adjustsFontForContentSizeCategory = YES;
  caption.textColor = MDKMutedTextColor();
  caption.textAlignment = NSTextAlignmentCenter;
  caption.text = title;

  UIStackView *stack =
      [[UIStackView alloc] initWithArrangedSubviews:@[value, caption]];
  stack.axis = UILayoutConstraintAxisVertical;
  stack.alignment = UIStackViewAlignmentFill;
  stack.spacing = 4.0;
  return stack;
}

- (void)refreshRequests {
  NSArray<DoraemonNetFlowHttpModel *> *snapshot = @[];
  @try {
    snapshot = [[DoraemonNetFlowDataSource shareInstance].httpModelArray copy];
  } @catch (__unused NSException *exception) {
    // DoKit 3.1.7 owns mutation synchronization but exposes only its mutable
    // array. A refresh collision should leave the previous snapshot visible.
    snapshot = self.allRequests ?: @[];
  }
  self.allRequests = snapshot;
  [self applyFilter];
  [self.tableView.refreshControl endRefreshing];
}

- (void)applyFilter {
  NSString *query = [self.searchField.text
      stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet]
                        .lowercaseString;
  BOOL errorsOnly = self.filterControl.selectedSegmentIndex == 1;
  NSMutableArray<DoraemonNetFlowHttpModel *> *filtered = [NSMutableArray array];
  for (DoraemonNetFlowHttpModel *model in self.allRequests) {
    if (errorsOnly && !MDKIsError(model)) {
      continue;
    }
    if (query.length > 0) {
      NSString *haystack = [NSString
          stringWithFormat:@"%@ %@ %@ %@", model.url ?: @"", MDKHost(model),
                           MDKMethod(model), MDKStatus(model)]
                                .lowercaseString;
      if ([haystack rangeOfString:query].location == NSNotFound) {
        continue;
      }
    }
    [filtered addObject:model];
  }
  self.visibleRequests = filtered;
  [self updateSummary];
  [self.tableView reloadData];
  [self updateEmptyState];
}

- (void)updateSummary {
  NSUInteger errorCount = 0;
  double receivedBytes = 0.0;
  for (DoraemonNetFlowHttpModel *model in self.allRequests) {
    errorCount += MDKIsError(model) ? 1 : 0;
    receivedBytes += model.downFlow.doubleValue;
  }
  self.requestCountLabel.text =
      [NSString stringWithFormat:@"%lu", (unsigned long)self.allRequests.count];
  self.errorCountLabel.text =
      [NSString stringWithFormat:@"%lu", (unsigned long)errorCount];
  self.errorCountLabel.textColor = errorCount > 0 ? MDKStatusColor(@"500")
                                                  : MDKTextColor();
  self.receivedBytesLabel.text = MDKFormatBytes(receivedBytes);
}

- (void)updateEmptyState {
  if (self.visibleRequests.count > 0) {
    self.tableView.backgroundView = nil;
    return;
  }
  UILabel *title = [[UILabel alloc] init];
  title.font = [UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];
  title.adjustsFontForContentSizeCategory = YES;
  title.textColor = MDKSecondaryTextColor();
  title.textAlignment = NSTextAlignmentCenter;
  title.text = self.allRequests.count == 0 ? @"No requests captured"
                                           : @"No matching requests";

  UILabel *body = [[UILabel alloc] init];
  body.font = [UIFont preferredFontForTextStyle:UIFontTextStyleFootnote];
  body.adjustsFontForContentSizeCategory = YES;
  body.textColor = MDKMutedTextColor();
  body.numberOfLines = 0;
  body.textAlignment = NSTextAlignmentCenter;
  body.text = self.allRequests.count == 0
                  ? @"Turn on Capture, use the app, then pull to refresh."
                  : @"Try a different search or switch back to All requests.";

  UIStackView *stack =
      [[UIStackView alloc] initWithArrangedSubviews:@[title, body]];
  stack.axis = UILayoutConstraintAxisVertical;
  stack.alignment = UIStackViewAlignmentFill;
  stack.spacing = 7.0;
  stack.translatesAutoresizingMaskIntoConstraints = NO;
  UIView *container = [[UIView alloc] init];
  container.backgroundColor = MDKBackgroundColor();
  [container addSubview:stack];
  [NSLayoutConstraint activateConstraints:@[
    [stack.centerYAnchor constraintEqualToAnchor:container.centerYAnchor
                                        constant:-28.0],
    [stack.leadingAnchor constraintEqualToAnchor:container.leadingAnchor
                                         constant:36.0],
    [stack.trailingAnchor constraintEqualToAnchor:container.trailingAnchor
                                          constant:-36.0],
  ]];
  self.tableView.backgroundView = container;
}

- (void)captureSwitchChanged {
  BOOL enabled = self.captureSwitch.on;
  [[DoraemonCacheManager sharedInstance] saveNetFlowSwitch:enabled];
  [[DoraemonNetFlowManager shareInstance] canInterceptNetFlow:enabled];
  [self refreshRequests];
  UIAccessibilityPostNotification(
      UIAccessibilityAnnouncementNotification,
      enabled ? @"Network capture on" : @"Network capture off");
}

- (void)contentSizeCategoryDidChange {
  [self.tableView reloadData];
}

- (void)showDoKitHome {
  [[DoraemonManager shareInstance] showDoraemon];
  [[DoraemonHomeWindow shareInstance] show];
}

#pragma mark UITableViewDataSource

- (NSInteger)tableView:(UITableView *)tableView
    numberOfRowsInSection:(NSInteger)section {
  (void)tableView;
  (void)section;
  return self.visibleRequests.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath {
  MDKNetworkRequestCell *cell =
      [tableView dequeueReusableCellWithIdentifier:@"MDKNetworkRequestCell"
                                      forIndexPath:indexPath];
  [cell renderModel:self.visibleRequests[indexPath.row]];
  return cell;
}

#pragma mark UITableViewDelegate

- (void)tableView:(UITableView *)tableView
    didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
  [tableView deselectRowAtIndexPath:indexPath animated:YES];
  MDKNetworkDetailViewController *detail =
      [[MDKNetworkDetailViewController alloc]
          initWithModel:self.visibleRequests[indexPath.row]];
  [self.navigationController pushViewController:detail animated:YES];
}

@end

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/try_on_experience_config.dart';
import 'package:selfx_kiosk/src/ui/try_on_generation_presentation.dart';
import 'package:selfx_kiosk/src/ui/try_on_generation_screen.dart';
import 'package:selfx_kiosk/src/ui/try_on_result_screen.dart';
import 'package:selfx_kiosk/src/ui/selfx_logo.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

void main() {
  for (final size in [
    const Size(320, 568),
    const Size(630, 1365),
    const Size(900, 1600),
    const Size(1280, 720),
    const Size(800, 480),
  ]) {
    testWidgets(
      'processing layout has proportional previews and 10/60/20/10 bands at $size',
      (tester) async {
        _viewport(tester, size);
        var backs = 0;
        await tester.pumpWidget(
          MaterialApp(
            theme: buildSelfxKioskTheme(),
            home: Scaffold(
              body: TryOnGenerationPresentation(
                status: KioskTryOnStatus.queued,
                motion: const AlwaysStoppedAnimation(0),
                onBack: () => backs++,
                experience: garmentTryOnExperience,
                personImagePath:
                    'assets/wallpapers/selfx-default-kiosk-wallpaper.png',
                garmentImagePath:
                    'assets/wallpapers/selfx-default-kiosk-wallpaper.png',
              ),
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 700));
        final back = find.byKey(const Key('generation-back'));
        expect(
          find.descendant(of: back, matching: find.text('Back')),
          findsOneWidget,
        );
        final button = tester.widget<TextButton>(back);
        expect(
          button.style!.backgroundColor!.resolve({}),
          const Color(0xFFECECEC),
        );
        expect(
          button.style!.foregroundColor!.resolve({}),
          SelfxKioskTokens.textPrimary,
        );
        expect(
          tester.getRect(back).right,
          lessThanOrEqualTo(tester.getRect(find.byType(SelfxLogo)).left),
        );
        final header = tester
            .getSize(find.byKey(const Key('generation-logo-section')))
            .height;
        expect(
          tester
              .getSize(find.byKey(const Key('generation-preview-section')))
              .height,
          closeTo(header * 6, 1),
        );
        expect(
          tester
              .getSize(find.byKey(const Key('generation-status-section')))
              .height,
          closeTo(header * 2, 1),
        );
        expect(
          tester
              .getSize(find.byKey(const Key('generation-animation-section')))
              .height,
          closeTo(header, 1),
        );
        expect(find.text('Your Photo'), findsOneWidget);
        expect(find.text('Garment Photo'), findsOneWidget);
        final person = tester.getRect(
          find.byKey(const Key('generation-person-image')),
        );
        final garment = tester.getRect(
          find.byKey(const Key('generation-garment-image')),
        );
        expect(person.right, lessThan(garment.left));
        expect(person.top, closeTo(garment.top, 1));
        for (final kind in ['person', 'garment']) {
          final frame = tester.getRect(
            find.byKey(Key('generation-$kind-card')),
          );
          final preview = find.byKey(Key('generation-$kind-image'));
          final image = find.descendant(
            of: preview,
            matching: find.byType(Image),
          );
          final rect = tester.getRect(image);
          // Only the thin card border remains; no image inset or letterboxing.
          expect(rect.left - frame.left, closeTo(1, 0.01));
          expect(frame.right - rect.right, closeTo(1, 0.01));
          expect(rect.top - frame.top, closeTo(1, 0.01));
          expect(tester.widget<Image>(image).fit, BoxFit.cover);
          expect(
            rect.bottom,
            lessThan(
              tester
                  .getRect(
                    find.text(
                      kind == 'person' ? 'Your Photo' : 'Garment Photo',
                    ),
                  )
                  .top,
            ),
          );
        }
        // Shorter previews leave extra room for processing messages/progress.
        await tester.ensureVisible(
          find.byKey(const Key('generation-percentage')),
        );
        expect(find.text('52%').hitTestable(), findsOneWidget);
        await tester.ensureVisible(
          find.byKey(const Key('generation-animation-section')),
        );
        expect(find.text('Analyzing').hitTestable(), findsOneWidget);
        await tester.ensureVisible(find.byKey(const Key('generation-back')));
        await tester.tap(find.byKey(const Key('generation-back')));
        expect(backs, 1);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'orange steps pulse and advance with estimated bar until success',
    (tester) async {
      _viewport(tester, const Size(900, 1600));
      final motion = AnimationController(
        vsync: tester,
        duration: const Duration(milliseconds: 4200),
      )..repeat();
      var status = KioskTryOnStatus.queued;
      Widget app() => MaterialApp(
        theme: buildSelfxKioskTheme(),
        home: Scaffold(
          body: TryOnGenerationPresentation(
            status: status,
            motion: motion,
            onBack: () {},
            experience: garmentTryOnExperience,
            processingMessage:
                'Still generating. Connection is slow, retrying.',
          ),
        ),
      );
      Color? stepColor(int index) =>
          (tester
                      .widget<AnimatedContainer>(
                        find.byKey(ValueKey('generation-step-$index')),
                      )
                      .decoration
                  as BoxDecoration)
              .color;
      double scale(int index) => tester
          .widget<Transform>(
            find.byKey(ValueKey('generation-step-scale-$index')),
          )
          .transform
          .entry(0, 0);
      await tester.pumpWidget(app());
      expect(find.text('52%'), findsOneWidget);
      expect(
        find.text('Still generating. Connection is slow, retrying.'),
        findsOneWidget,
      );
      expect(stepColor(0), SelfxKioskTokens.primary);
      expect(stepColor(1), SelfxKioskTokens.primary);
      expect(stepColor(2), isNot(SelfxKioskTokens.primary));
      final initialScale = scale(1);
      await tester.pump(const Duration(milliseconds: 100));
      expect(scale(1), isNot(initialScale));
      expect(scale(0), 1);
      status = KioskTryOnStatus.processing;
      await tester.pumpWidget(app());
      await tester.pump(const Duration(milliseconds: 200));
      final percent = int.parse(
        tester
            .widget<Text>(find.byKey(const Key('generation-percentage')))
            .data!
            .replaceAll('%', ''),
      );
      expect(percent, inInclusiveRange(52, 78));
      expect(
        tester
            .widget<FractionallySizedBox>(
              find.byKey(const Key('generation-progress-fill')),
            )
            .widthFactor,
        closeTo(percent / 100, 0.01),
      );
      await tester.pump(const Duration(milliseconds: 700));
      expect(find.text('78%'), findsOneWidget);
      expect(stepColor(2), SelfxKioskTokens.primary);
      expect(find.text('100%'), findsNothing);
      status = KioskTryOnStatus.succeeded;
      await tester.pumpWidget(app());
      await tester.pump(const Duration(milliseconds: 700));
      expect(find.text('100%'), findsOneWidget);
      expect(scale(2), 1);
      await tester.pumpWidget(const SizedBox.shrink());
      motion.dispose();
    },
  );

  testWidgets('screen submits once, keeps retry and opens result once', (
    tester,
  ) async {
    _viewport(tester, const Size(900, 1600));
    final capture = fixtures.testController();
    final uploads = fixtures.testUploadController(capture.captureStore);
    final session = _Session();
    addTearDown(capture.dispose);
    addTearDown(uploads.dispose);
    addTearDown(session.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: buildSelfxKioskTheme(),
        home: TryOnGenerationScreen(
          captureController: capture,
          tryOnController: session,
          uploadController: uploads,
        ),
      ),
    );
    await tester.pump();
    expect(session.submissions, 1);
    session.update(KioskTryOnStatus.uploading);
    await tester.pump(const Duration(milliseconds: 700));
    expect(session.submissions, 1);
    session.update(KioskTryOnStatus.failed);
    await tester.pump();
    final retry = find.byKey(const Key('try-on-retry-polling'));
    await tester.ensureVisible(retry);
    await tester.tap(retry);
    await tester.pump();
    expect(session.submissions, 2);
    session.update(KioskTryOnStatus.queued);
    await tester.pump();
    session.result = const KioskTryOnResult(
      run: KioskTryOnRun(id: 'result-test', status: KioskTryOnStatus.succeeded),
      generatedImage: 'unavailable-test-result.png',
    );
    session.update(KioskTryOnStatus.succeeded);
    for (var frame = 0; frame < 6; frame++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
    expect(find.byType(TryOnResultScreen), findsOneWidget);
    expect(find.byType(TryOnGenerationScreen), findsNothing);
    expect(session.submissions, 2);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('jewellery uses matching labels and icons', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TryOnGenerationPresentation(
            status: KioskTryOnStatus.processing,
            motion: const AlwaysStoppedAnimation(0),
            experience: jewelleryTryOnExperience,
            onBack: () {},
          ),
        ),
      ),
    );
    expect(find.text('Jewellery Photo'), findsOneWidget);
    expect(find.text('Garment Photo'), findsNothing);
    expect(find.text('the jewellery'), findsOneWidget);
    final headerHeight = tester
        .getSize(find.byKey(const Key('generation-logo-section')))
        .height;
    expect(
      tester
          .getSize(find.byKey(const Key('generation-preview-section')))
          .height,
      closeTo(headerHeight * 6, 1),
    );
    expect(
      tester.getSize(find.byKey(const Key('generation-status-section'))).height,
      closeTo(headerHeight * 2, 1),
    );
    expect(tester.takeException(), isNull);
  });
}

void _viewport(WidgetTester tester, Size size) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

class _Session extends KioskTryOnSessionController {
  _Session() : super(gateway: fixtures.FakeKioskTryOnGateway());
  int submissions = 0;
  @override
  Future<void> submitFromCapture(CaptureSessionController capture) async {
    submissions++;
  }

  void update(KioskTryOnStatus value) {
    status = value;
    notifyListeners();
  }
}

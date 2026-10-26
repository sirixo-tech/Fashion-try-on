import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/live/person_analysis.dart';
import 'package:selfx_kiosk/src/session/capture_scope.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/garment_reference_profile.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/model_garment_compatibility.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';

void main() {
  group('GarmentReferenceProfile', () {
    test('product or unknown garment is not blindly mapped to on-model', () {
      final profile = resolveGarmentReferenceProfile();

      expect(profile.kind, GarmentReferenceKind.unknown);
      expect(profile.photoType, KioskGarmentPhotoType.auto);
    });

    test('verified person-worn garment maps to on-model internally', () {
      final profile = resolveGarmentReferenceProfile(
        bodyContext: CaptureTargetMetadata(
          scope: CaptureScope.top,
          targetRegion: const TargetSubjectRegion(
            x: 0.2,
            y: 0.1,
            width: 0.6,
            height: 0.5,
          ),
          lockState: PrimarySubjectLockState.locked,
          visualProminenceScore: 0.88,
          observedFrameCount: 3,
          analyzerDisplayName: 'Test analyzer',
          supportsMultiplePeople: true,
          capturedAt: DateTime.now(),
        ),
      );

      expect(profile.kind, GarmentReferenceKind.onPerson);
      expect(profile.photoType, KioskGarmentPhotoType.onModel);
    });
  });

  group('ModelGarmentCompatibilityService', () {
    const service = ModelGarmentCompatibilityService();

    test('allows compatible coverage/category combinations', () {
      expect(
        service
            .check(
              coverage: ModelCoverage.upperBody,
              intent: KioskGarmentIntent.top,
            )
            .supported,
        isTrue,
      );
      expect(
        service
            .check(
              coverage: ModelCoverage.fullBody,
              intent: KioskGarmentIntent.bottom,
            )
            .supported,
        isTrue,
      );
      expect(
        service
            .check(
              coverage: ModelCoverage.fullBody,
              intent: KioskGarmentIntent.fullOutfit,
            )
            .supported,
        isTrue,
      );
    });

    test('blocks incompatible combinations with customer wording', () {
      final bottom = service.check(
        coverage: ModelCoverage.upperBody,
        intent: KioskGarmentIntent.bottom,
      );
      final full = service.check(
        coverage: ModelCoverage.upperBody,
        intent: KioskGarmentIntent.fullOutfit,
      );

      expect(bottom.supported, isFalse);
      expect(bottom.guidance?.title, 'Update your photo to try bottoms');
      expect(
        bottom.guidance?.message,
        'We need to see more of your lower body for this item.',
      );
      expect(full.supported, isFalse);
      expect(full.guidance?.title, 'Update your photo to try a full outfit');
      expect(full.guidance?.message, 'We need a full-body photo for this item.');
    });

    test('does not expose technical enum wording in customer guidance', () {
      final guidance = service
          .check(
            coverage: ModelCoverage.unknown,
            intent: KioskGarmentIntent.bottom,
          )
          .guidance!;

      expect(guidance.title, isNot(contains('UPPER_BODY')));
      expect(guidance.message, isNot(contains('LOWER_BODY')));
      expect(guidance.message, isNot(contains('coverage')));
    });
  });

  testWidgets('selected category button is immediately orange with centered content', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildSelfxKioskTheme(),
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 250,
              child: SelfxKioskButton(
                key: const Key('selected-category'),
                label: 'Bottom',
                icon: Icons.accessibility_new_outlined,
                variant: SelfxKioskButtonVariant.selected,
                minHeight: 86,
                textAlign: TextAlign.center,
                mainAxisAlignment: MainAxisAlignment.center,
                onPressed: () {},
              ),
            ),
          ),
        ),
      ),
    );

    final button = find.byKey(const Key('selected-category'));
    final material = tester.widget<Material>(
      find.descendant(of: button, matching: find.byType(Material)),
    );
    final row = tester.widget<Row>(
      find.descendant(of: button, matching: find.byType(Row)),
    );
    final text = tester.widget<Text>(find.text('Bottom'));

    expect(material.color, SelfxKioskTokens.primary);
    expect(text.style?.color, SelfxKioskTokens.onPrimary);
    expect(row.mainAxisAlignment, MainAxisAlignment.center);
    expect(row.crossAxisAlignment, CrossAxisAlignment.center);
  });
}

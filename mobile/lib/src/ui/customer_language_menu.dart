import 'package:flutter/material.dart';
import '../auth/customer_controller.dart';
import '../l10n/customer_copy.dart';
import '../l10n/customer_language.dart';
import 'customer_theme.dart';

class CustomerLanguageMenu extends StatelessWidget {
  final CustomerController auth;
  const CustomerLanguageMenu({super.key, required this.auth});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: auth,
    builder: (context, _) => PopupMenuButton<String>(
      key: const ValueKey('header-language'),
      tooltip: tr(context, 'Language'),
      enabled: !auth.languageSaving,
      initialValue: auth.language,
      position: PopupMenuPosition.under,
      color: CustomerColors.canvas,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      constraints: const BoxConstraints(
        minWidth: 230,
        maxWidth: 300,
        maxHeight: 400,
      ),
      itemBuilder: (_) => [
        for (final item in CustomerLanguage.all)
          PopupMenuItem(
            value: item.code,
            child: Row(
              children: [
                SizedBox(
                  width: 44,
                  child: Text(
                    item.shortName,
                    textDirection: TextDirection.ltr,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(item.nativeName),
                      if (item.nativeName != item.name)
                        Text(
                          item.name,
                          style: const TextStyle(
                            fontSize: 11,
                            color: CustomerColors.muted,
                          ),
                        ),
                    ],
                  ),
                ),
                if (item.code == auth.language)
                  const Icon(
                    Icons.check_rounded,
                    color: CustomerColors.orange,
                    size: 20,
                  ),
              ],
            ),
          ),
      ],
      onSelected: (language) async {
        try {
          await auth.changeLanguage(language);
        } catch (_) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: CustomerText(
                  tr(
                    context,
                    'Your language could not be saved. Please try again.',
                  ),
                ),
              ),
            );
          }
        }
      },
      child: Semantics(
        button: true,
        label:
            '${tr(context, 'Language')}: ${CustomerLanguage.find(auth.language).nativeName}',
        child: SizedBox(
          width: 70,
          height: 48,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                CustomerLanguage.find(auth.language).shortName,
                textDirection: TextDirection.ltr,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const Icon(Icons.keyboard_arrow_down_rounded, size: 18),
            ],
          ),
        ),
      ),
    ),
  );
}

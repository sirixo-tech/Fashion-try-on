import 'package:flutter/material.dart';

import '../experience/customer_experience.dart';
import '../l10n/customer_copy.dart';
import 'customer_demo_catalog.dart';

/// Uses only the catalog already available in this customer or Store visit.
List<Json> suggestedResultGarments(CustomerExperience experience) {
  final catalog = experience.storeMode
      ? experience.products
      : experience.demoProducts;
  final current = experience.storeMode
      ? experience.product
      : experience.demoProduct;
  final currentId = current?['id'];
  final category =
      current?['category'] ??
      (experience.storeMode
          ? null
          : experience.auth.profile?.interests
                .where((value) => value == 'WOMEN' || value == 'MEN')
                .firstOrNull);
  final type = current?['type'] ?? current?['garmentCategory'];
  final available = catalog.indexed
      .where((entry) => entry.$2['id'] != currentId)
      .toList();
  final categoryMatches = available
      .where((entry) => category == null || entry.$2['category'] == category)
      .toList();
  final indexed = categoryMatches.isNotEmpty ? categoryMatches : available;
  if (indexed.isEmpty) return const [];
  final currentIndex = catalog.indexWhere((item) => item['id'] == currentId);
  int score(Json item) {
    final candidateType = item['type'] ?? item['garmentCategory'];
    if (type == 'TOP' && candidateType == 'BOTTOM' ||
        type == 'BOTTOM' && candidateType == 'TOP') {
      return 0;
    }
    if (type != null && candidateType == type) return 1;
    return 2;
  }

  indexed.sort((a, b) {
    final byType = score(a.$2).compareTo(score(b.$2));
    if (byType != 0) return byType;
    final aDistance = (a.$1 - currentIndex + catalog.length) % catalog.length;
    final bDistance = (b.$1 - currentIndex + catalog.length) % catalog.length;
    return aDistance.compareTo(bDistance);
  });
  return indexed.take(4).map((entry) => entry.$2).toList();
}

class CustomerResultSuggestions extends StatelessWidget {
  final CustomerExperience experience;
  final Future<void> Function(Json item) onSelect;
  final bool disabled;
  const CustomerResultSuggestions({
    super.key,
    required this.experience,
    required this.onSelect,
    this.disabled = false,
  });

  @override
  Widget build(BuildContext context) {
    final suggestions = suggestedResultGarments(experience);
    if (suggestions.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 14),
        const CustomerText(
          'Try another look',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 168,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: suggestions.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final item = suggestions[index];
              final image = experience.storeMode
                  ? ((item['image'] as Map?)?['url'] as String?)
                  : demoProductImage(item['id'] as String);
              return InkWell(
                key: ValueKey('suggested-${item['id']}'),
                onTap: disabled ? null : () => onSelect(item),
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  width: 122,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      Expanded(
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            image == null
                                ? const Icon(Icons.checkroom_outlined)
                                : experience.storeMode
                                ? Image.network(image, fit: BoxFit.cover)
                                : Image.asset(image, fit: BoxFit.cover),
                            Align(
                              alignment: Alignment.topRight,
                              child: IconButton.filledTonal(
                                tooltip:
                                    experience.isGarmentSaved(
                                      experience.storeMode ? 'STORE' : 'DEMO',
                                      item['id'] as String,
                                    )
                                    ? 'Remove from saved garments'
                                    : 'Save garment',
                                onPressed: () async {
                                  try {
                                    await experience.toggleSavedGarment(
                                      experience.storeMode ? 'STORE' : 'DEMO',
                                      item['id'] as String,
                                    );
                                  } catch (error) {
                                    if (context.mounted) {
                                      ScaffoldMessenger.of(
                                        context,
                                      ).showSnackBar(
                                        SnackBar(
                                          content: CustomerText(
                                            CustomerExperience.message(error),
                                          ),
                                        ),
                                      );
                                    }
                                  }
                                },
                                icon: Icon(
                                  experience.isGarmentSaved(
                                        experience.storeMode ? 'STORE' : 'DEMO',
                                        item['id'] as String,
                                      )
                                      ? Icons.favorite_rounded
                                      : Icons.favorite_border_rounded,
                                  size: 18,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: CustomerText(
                          item['name'] as String? ?? 'Outfit',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import '../experience/customer_experience.dart';
import '../l10n/customer_copy.dart';
import 'customer_theme.dart';

const _productImages = {
  'terracotta-blazer': 'assets/editorial/terracotta-blazer.webp',
  'burgundy-dress': 'assets/editorial/burgundy-dress.webp',
  'navy-overshirt': 'assets/editorial/navy-overshirt.webp',
};
const _modelImages = {
  'muse': 'assets/editorial/demo-model-maya.webp',
  'tailored': 'assets/editorial/demo-model-arjun.webp',
};
String? demoProductImage(String id) => _productImages[id];

class CustomerDemoCatalog extends StatefulWidget {
  final CustomerExperience experience;
  final Future<void> Function(Json product, String? modelId) onTryOn;
  const CustomerDemoCatalog({
    super.key,
    required this.experience,
    required this.onTryOn,
  });

  @override
  State<CustomerDemoCatalog> createState() => _CustomerDemoCatalogState();
}

class _CustomerDemoCatalogState extends State<CustomerDemoCatalog> {
  String category = 'ALL';
  final search = TextEditingController();

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final exp = widget.experience;
    final products = exp.demoProducts
        .where(
          (item) =>
              (category == 'ALL' || item['category'] == category) &&
              (item['name'] as String).toLowerCase().contains(
                search.text.trim().toLowerCase(),
              ),
        )
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: CustomerText(
                'Explore outfits',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
            ),
            const Icon(
              Icons.auto_awesome_rounded,
              color: CustomerColors.orange,
            ),
          ],
        ),
        const SizedBox(height: 6),
        const CustomerText(
          'A starter collection for your first Try-On.',
          style: TextStyle(color: CustomerColors.muted),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: search,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            hintText: 'Search demo outfits',
            prefixIcon: Icon(Icons.search_rounded),
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final value in ['ALL', 'WOMEN', 'MEN'])
              ChoiceChip(
                label: CustomerText(switch (value) {
                  'ALL' => 'All',
                  'WOMEN' => 'Women',
                  _ => 'Men',
                }),
                selected: category == value,
                onSelected: (_) => setState(() => category = value),
                selectedColor: CustomerColors.ink,
                labelStyle: TextStyle(
                  color: category == value ? Colors.white : CustomerColors.ink,
                ),
                showCheckmark: false,
              ),
          ],
        ),
        const SizedBox(height: 16),
        if (exp.demoLoading && exp.demoProducts.isEmpty)
          const LinearProgressIndicator()
        else if (exp.demoError != null && exp.demoProducts.isEmpty) ...[
          CustomerNotice(
            'Could not load the demo collection. ${exp.demoError}',
            error: true,
          ),
          TextButton(
            onPressed: exp.loadDemoCatalog,
            child: const CustomerText('Try again'),
          ),
        ] else if (products.isEmpty)
          CustomerNotice(
            search.text.trim().isEmpty
                ? 'No demo outfits in this category yet.'
                : 'No demo outfits match your search.',
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: products.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: .68,
            ),
            itemBuilder: (context, index) {
              final product = products[index];
              final path = _productImages[product['id']];
              if (path == null) return const SizedBox.shrink();
              return Material(
                color: Colors.white,
                clipBehavior: Clip.antiAlias,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                  side: const BorderSide(color: CustomerColors.line),
                ),
                child: InkWell(
                  onTap: () => Navigator.push<void>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => CustomerDemoProductScreen(
                        product: product,
                        models: exp.demoModels,
                        onTryOn: widget.onTryOn,
                      ),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: SizedBox(
                          width: double.infinity,
                          child: Image.asset(path, fit: BoxFit.contain),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 2, 12, 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const CustomerText(
                              'SELFX DEMO',
                              style: TextStyle(
                                fontSize: 9,
                                letterSpacing: 1.5,
                                color: CustomerColors.orange,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 4),
                            CustomerText(
                              product['name'] as String,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
      ],
    );
  }
}

class CustomerDemoProductScreen extends StatefulWidget {
  final Json product;
  final List<Json> models;
  final Future<void> Function(Json product, String? modelId) onTryOn;
  const CustomerDemoProductScreen({
    super.key,
    required this.product,
    required this.models,
    required this.onTryOn,
  });

  @override
  State<CustomerDemoProductScreen> createState() =>
      _CustomerDemoProductScreenState();
}

class _CustomerDemoProductScreenState extends State<CustomerDemoProductScreen> {
  String? modelId;
  bool busy = false;

  @override
  Widget build(BuildContext context) {
    final path = _productImages[widget.product['id']];
    final models = widget.models
        .where((item) => _modelImages.containsKey(item['id']))
        .toList();
    return Scaffold(
      appBar: AppBar(title: const CustomerText('Demo outfit')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 30),
        children: [
          if (path != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(26),
              child: Container(
                color: Colors.white,
                height: 340,
                child: Image.asset(path, fit: BoxFit.contain),
              ),
            ),
          const SizedBox(height: 18),
          const CustomerText(
            'SELFX DEMO COLLECTION',
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 1.8,
              color: CustomerColors.orange,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          CustomerText(
            widget.product['name'] as String,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 6),
          const CustomerText(
            'A sample outfit to explore Try-On. Not a product for sale.',
            style: TextStyle(color: CustomerColors.muted),
          ),
          const SizedBox(height: 24),
          CustomerText(
            'Try it on',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 10),
          const CustomerText(
            'Your saved full-body photo is selected by default. Or choose a demo model.',
            style: TextStyle(color: CustomerColors.muted),
          ),
          const SizedBox(height: 14),
          ChoiceChip(
            label: const CustomerText('My Avatar'),
            avatar: const Icon(Icons.person_outline_rounded, size: 18),
            selected: modelId == null,
            onSelected: (_) => setState(() => modelId = null),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 176,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: models.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final model = models[index], id = model['id'] as String;
                return GestureDetector(
                  onTap: () => setState(() => modelId = id),
                  child: Container(
                    width: 112,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: modelId == id
                            ? CustomerColors.orange
                            : CustomerColors.line,
                        width: modelId == id ? 2 : 1,
                      ),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      children: [
                        Expanded(
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              Image.asset(
                                _modelImages[id]!,
                                fit: BoxFit.cover,
                                alignment: Alignment.topCenter,
                              ),
                              if (modelId == id)
                                const Align(
                                  alignment: Alignment.topRight,
                                  child: Padding(
                                    padding: EdgeInsets.all(7),
                                    child: Icon(
                                      Icons.check_circle,
                                      color: CustomerColors.orange,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(7),
                          child: CustomerText(
                            model['name'] as String,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
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
          const SizedBox(height: 14),
          const CustomerNotice(
            'A demo model is a sample person image. Your choice applies only to this Try-On. One personal credit is used for a completed look.',
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: busy
                ? null
                : () async {
                    setState(() => busy = true);
                    try {
                      await widget.onTryOn(widget.product, modelId);
                    } finally {
                      if (mounted) setState(() => busy = false);
                    }
                  },
            icon: const Icon(Icons.auto_awesome_rounded),
            label: const CustomerText('Try on this outfit'),
          ),
        ],
      ),
    );
  }
}

import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

Future<void> discardPickedCopy(String path) async {
  try {
    final root = p.normalize((await getTemporaryDirectory()).absolute.path);
    final file = File(path);
    // Only a picker-created copy in our private cache; never the gallery original.
    if (p.isWithin(root, p.normalize(file.absolute.path)) &&
        await file.exists()) {
      await file.delete();
    }
  } catch (_) {
    /* The OS can clear an inaccessible temporary picker copy. */
  }
}

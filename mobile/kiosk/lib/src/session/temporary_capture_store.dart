import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

class TemporaryCaptureStore {
  Future<String> preserveOriginal(File source) async {
    final directory = await _captureDirectory();
    final extension = p.extension(source.path).isEmpty
        ? '.jpg'
        : p.extension(source.path);
    final target = File(
      p.join(
        directory.path,
        'capture-${DateTime.now().microsecondsSinceEpoch}$extension',
      ),
    );
    await source.copy(target.path);
    return target.path;
  }

  Future<void> deleteCapture(String? path) async {
    if (path == null) {
      return;
    }
    final file = File(path);
    if (await file.exists()) {
      await file.delete();
    }
  }

  Future<void> clearAll() async {
    final directory = await _captureDirectory();
    if (await directory.exists()) {
      await for (final entity in directory.list()) {
        if (entity is File) {
          await entity.delete();
        }
      }
    }
  }

  Future<Directory> _captureDirectory() async {
    final temp = await getTemporaryDirectory();
    final directory = Directory(p.join(temp.path, 'selfx-kiosk-captures'));
    if (!await directory.exists()) {
      await directory.create(recursive: true);
    }
    return directory;
  }
}

class InMemoryTemporaryCaptureStore extends TemporaryCaptureStore {
  final List<String> deletedPaths = [];
  int preservedCount = 0;

  @override
  Future<String> preserveOriginal(File source) async {
    preservedCount += 1;
    return source.path;
  }

  @override
  Future<void> deleteCapture(String? path) async {
    if (path != null) {
      deletedPaths.add(path);
    }
  }

  @override
  Future<void> clearAll() async {
    deletedPaths.add('*');
  }
}

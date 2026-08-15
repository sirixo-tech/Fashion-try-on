# SelfX Kiosk release/R8 rules
#
# ML Kit discovers these registrars reflectively.
# Their no-argument constructors must survive release optimization.

-keep class com.google.mlkit.vision.pose.internal.PoseRegistrar {
    public <init>();
}

-keep class com.google.mlkit.common.internal.CommonComponentRegistrar {
    public <init>();
}

-keep class com.google.mlkit.vision.common.internal.VisionCommonRegistrar {
    public <init>();
}

# Preserve any other Firebase/ML Kit component registrar constructor
# that is loaded through ComponentDiscovery.
-keep class * implements com.google.firebase.components.ComponentRegistrar {
    public <init>();
}

# WorkManager uses Room for its internal WorkDatabase.
# Preserve the generated implementation used during startup.
-keep class androidx.work.impl.WorkDatabase_Impl { *; }

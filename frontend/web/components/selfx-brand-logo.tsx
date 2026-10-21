import Image from "next/image";

export function SelfxBrandLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/selfx-logo.png"
      alt="SelfX"
      width={278}
      height={105}
      priority={priority}
      className={className}
    />
  );
}

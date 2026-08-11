import type { ReactNode } from "react";

import { Box, Card, Center, Stack, Text, Title, SelfxLogo } from "@selfx/ui";

interface Signup2Props {
  heading?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

const Signup2 = ({
  heading = "Sign in",
  description,
  children,
  footer,
}: Signup2Props) => {
  return (
    <Box component="section" mih="100dvh" bg="gray.0">
      <Center mih="100dvh" p="md">
        <Stack w="100%" maw={400} align="center" gap="lg">
          <SelfxLogo />
          <Card w="100%" shadow="sm" p="xl">
            <Stack gap="md">
              <Stack gap={4} ta="center">
                {heading ? (
                  <Title order={1} size="h3">
                    {heading}
                  </Title>
                ) : null}
                {description ? (
                  <Text size="sm" c="dimmed">
                    {description}
                  </Text>
                ) : null}
              </Stack>
              {children}
            </Stack>
          </Card>
          {footer ? (
            <Text ta="center" size="sm" c="dimmed">
              {footer}
            </Text>
          ) : null}
        </Stack>
      </Center>
    </Box>
  );
};

export { Signup2 };

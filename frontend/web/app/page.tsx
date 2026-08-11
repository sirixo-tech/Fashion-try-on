import {
  Button,
  Card,
  Center,
  Group,
  Stack,
  Text,
  Title,
  SelfxLogo,
} from "@selfx/ui";

export default function HomePage() {
  return (
    <Center component="main" mih="100dvh" p="md">
      <Card w="100%" maw={560} shadow="sm" p="xl">
        <Stack gap="md">
          <SelfxLogo />
          <Stack gap={4}>
            <Title order={1} size="h2">
              SelfX Admin
            </Title>
            <Text c="dimmed" size="sm">
              Shared design system and authenticated shell foundation.
            </Text>
          </Stack>
          <Group>
            <Button component="a" href="/login">
              Sign in
            </Button>
            <Button variant="default" component="a" href="/app/dashboard">
              Open shell
            </Button>
          </Group>
        </Stack>
      </Card>
    </Center>
  );
}

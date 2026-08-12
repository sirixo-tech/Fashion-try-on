import { createTheme, virtualColor } from "@mantine/core";

export const selfxTheme = createTheme({
  primaryColor: "selfx",
  primaryShade: { light: 6, dark: 4 },
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  headings: {
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    fontWeight: "650",
  },
  colors: {
    selfx: [
      "#edf5ff",
      "#d8e9ff",
      "#afd2ff",
      "#82b8ff",
      "#5fa2ff",
      "#4693ff",
      "#2f86f6",
      "#1f74dd",
      "#1767c6",
      "#0758ae",
    ],
    success: [
      "#eafbf2",
      "#d3f5e0",
      "#a8eabd",
      "#78df98",
      "#51d67a",
      "#37d168",
      "#24c65a",
      "#18af4d",
      "#0d9b42",
      "#008637",
    ],
    warning: [
      "#fff8e1",
      "#ffefbf",
      "#ffde79",
      "#ffca2f",
      "#f8b800",
      "#e3a600",
      "#ca9300",
      "#af7d00",
      "#966b00",
      "#805a00",
    ],
    info: virtualColor({
      name: "info",
      light: "blue",
      dark: "cyan",
    }),
    danger: virtualColor({
      name: "danger",
      light: "red",
      dark: "red",
    }),
  },
  radius: {
    xs: "0.25rem",
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.625rem",
    xl: "0.75rem",
  },
  shadows: {
    xs: "0 1px 2px rgb(15 23 42 / 0.06)",
    sm: "0 1px 2px rgb(15 23 42 / 0.07), 0 8px 24px rgb(15 23 42 / 0.08)",
    md: "0 10px 30px rgb(15 23 42 / 0.12)",
  },
  spacing: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  defaultRadius: "md",
  focusRing: "auto",
  components: {
    Button: {
      defaultProps: {
        radius: "md",
      },
    },
    Card: {
      defaultProps: {
        radius: "md",
        withBorder: true,
        shadow: "none",
      },
    },
    Paper: {
      defaultProps: {
        radius: "md",
      },
    },
    TextInput: {
      defaultProps: {
        radius: "md",
      },
    },
    PasswordInput: {
      defaultProps: {
        radius: "md",
      },
    },
    Select: {
      defaultProps: {
        radius: "md",
      },
    },
    Textarea: {
      defaultProps: {
        radius: "md",
      },
    },
    Modal: {
      defaultProps: {
        radius: "md",
        centered: true,
      },
    },
  },
});

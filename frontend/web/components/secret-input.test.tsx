import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";
import { SecretInput, Label } from "@selfx/ui";

afterEach(cleanup);

function Fixture({
  saved = false,
  revealable = false,
}: {
  saved?: boolean;
  revealable?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <>
      <Label htmlFor="secret">Secret</Label>
      <SecretInput
        id="secret"
        saved={saved}
        revealable={revealable}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </>
  );
}

it("uses dots only as a saved-secret placeholder, with no key reveal control", () => {
  render(<Fixture saved />);
  const field = screen.getByLabelText("Secret") as HTMLInputElement;
  expect(field.value).toBe("");
  expect(field.placeholder).toBe("••••••••");
  expect(field.type).toBe("password");
  expect(screen.queryByRole("button")).toBeNull();
});

it("reveals only typed passwords and returns to masking after clearing", () => {
  render(<Fixture saved revealable />);
  const field = screen.getByLabelText("Secret") as HTMLInputElement;
  expect(
    (screen.getByRole("button", { name: "Show password" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.change(field, { target: { value: "new-typed-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(field.type).toBe("text");
  expect(field.value).toBe("new-typed-password");
  fireEvent.change(field, { target: { value: "" } });
  expect(field.type).toBe("password");
  expect(field.placeholder).toBe("••••••••");
  fireEvent.change(field, { target: { value: "another-password" } });
  expect(field.type).toBe("password");
});

it("starts a new secret empty without a saved-value indication", () => {
  render(<Fixture />);
  const field = screen.getByLabelText("Secret") as HTMLInputElement;
  expect(field.value).toBe("");
  expect(field.placeholder).toBe("");
});

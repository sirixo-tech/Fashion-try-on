import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UsersController } from "./users.controller.js";
import {
  DeleteUserDto,
  StoreAdminEmailDto,
  AssignFirstOwnerDto,
  UpdateUserDto,
  UsersQueryDto,
} from "./dto/users.dto.js";

describe("Users authorization and validation", () => {
  const request = { headers: { authorization: "Bearer test" } } as never;
  it("blocks Store account selection and email changes for non-Superadmins", async () => {
    const users = { assignStoreAdmin: vi.fn(), updateStoreAdminEmail: vi.fn() };
    const controller = new UsersController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "actor" }),
      } as never,
      { isSuperadmin: vi.fn().mockResolvedValue(false) } as never,
      users as never,
      {} as never,
    );
    await expect(
      controller.assignStoreAdmin(request, "target", {} as never),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      controller.updateStoreAdminEmail(request, "target", {} as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(users.assignStoreAdmin).not.toHaveBeenCalled();
    expect(users.updateStoreAdminEmail).not.toHaveBeenCalled();
    expect(
      (
        await validate(
          plainToInstance(StoreAdminEmailDto, {
            version: "bad",
            storeId: "bad",
            email: "bad",
          }),
        )
      )
        .map((e) => e.property)
        .sort(),
    ).toEqual(["email", "storeId", "version"]);
    expect(
      await validate(
        plainToInstance(AssignFirstOwnerDto, {
          version: "bad",
          storeId: "bad",
          confirmStoreName: "",
        }),
      ),
    ).toHaveLength(3);
  });
  it("rejects account updates and first-owner assignment before service execution for non-Superadmins", async () => {
    const users = { update: vi.fn(), assignFirstOwner: vi.fn() };
    const controller = new UsersController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "actor" }),
      } as never,
      { isSuperadmin: vi.fn().mockResolvedValue(false) } as never,
      users as never,
      {} as never,
    );
    await expect(
      controller.update(request, "target", {} as never),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      controller.assignFirstOwner(request, "target", {} as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(users.update).not.toHaveBeenCalled();
    expect(users.assignFirstOwner).not.toHaveBeenCalled();
  });
  it("does not let ordinary Store users list all users", async () => {
    const users = { list: vi.fn() };
    const controller = new UsersController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "actor" }),
      } as never,
      { hasPermission: vi.fn().mockResolvedValue(false) } as never,
      users as never,
      {} as never,
    );
    await expect(
      controller.list(request, new UsersQueryDto()),
    ).rejects.toMatchObject({ status: 403 });
    expect(users.list).not.toHaveBeenCalled();
  });
  it("allows Superadmin account editing after authentication", async () => {
    const users = { update: vi.fn().mockResolvedValue({ id: "target" }) };
    const controller = new UsersController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "actor" }),
      } as never,
      { isSuperadmin: vi.fn().mockResolvedValue(true) } as never,
      users as never,
      {} as never,
    );
    await controller.update(request, "target", {} as never);
    expect(users.update).toHaveBeenCalledWith("actor", "target", {});
  });
  it("bounds pagination and rejects malformed edit fields, null secrets and duplicate roles", async () => {
    expect(
      await validate(
        plainToInstance(UsersQueryDto, { pageSize: 101, page: -1 }),
      ),
    ).toHaveLength(2);
    const bad = plainToInstance(UpdateUserDto, {
      version: "bad",
      displayName: " ",
      email: "bad",
      status: "SUPERADMIN",
      newPassword: null,
      platformRoleIds: ["bad", "bad"],
      memberships: [{ storeId: "bad", status: "OWNER", roleIds: [] }],
    });
    expect((await validate(bad)).map((e) => e.property)).toEqual(
      expect.arrayContaining([
        "version",
        "displayName",
        "email",
        "status",
        "newPassword",
        "platformRoleIds",
        "memberships",
      ]),
    );
  });
  it("blocks account deletion before service execution for non-Superadmins", async () => {
    const deletion = { deleteAccount: vi.fn() };
    const controller = new UsersController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "actor" }),
      } as never,
      { isSuperadmin: vi.fn().mockResolvedValue(false) } as never,
      {} as never,
      deletion as never,
    );
    await expect(
      controller.deleteUser(request, "target", {} as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(deletion.deleteAccount).not.toHaveBeenCalled();
    expect(
      await validate(
        plainToInstance(DeleteUserDto, {
          version: "stale",
          confirmEmail: "bad",
        }),
      ),
    ).toHaveLength(2);
  });
});

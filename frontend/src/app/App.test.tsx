import { afterEach, describe, expect, it } from "vitest";
import { parseRouteFromLocation } from "./App";

describe("App routing - parseRouteFromLocation", () => {
  const originalLocation = window.location.href;

  afterEach(() => {
    window.history.replaceState(null, "", originalLocation);
  });

  it("parses direct user slug path /userslug as watch route", () => {
    window.history.replaceState(null, "", "/testerslug");
    expect(parseRouteFromLocation()).toEqual({
      page: "watch",
      slug: "testerslug",
    });
  });

  it("parses /@userslug path as watch route", () => {
    window.history.replaceState(null, "", "/@alice_streamer");
    expect(parseRouteFromLocation()).toEqual({
      page: "watch",
      slug: "alice_streamer",
    });
  });

  it("parses /watch/userslug path as watch route", () => {
    window.history.replaceState(null, "", "/watch/bob_coder");
    expect(parseRouteFromLocation()).toEqual({
      page: "watch",
      slug: "bob_coder",
    });
  });

  it("parses /?channel=userslug query as watch route", () => {
    window.history.replaceState(null, "", "/?channel=mira_codes");
    expect(parseRouteFromLocation()).toEqual({
      page: "watch",
      slug: "mira_codes",
    });
  });

  it("parses /?page=watch&channel=userslug query as watch route", () => {
    window.history.replaceState(null, "", "/?page=watch&channel=kaelen_fps");
    expect(parseRouteFromLocation()).toEqual({
      page: "watch",
      slug: "kaelen_fps",
    });
  });

  it("parses /profile route", () => {
    window.history.replaceState(null, "", "/profile");
    expect(parseRouteFromLocation()).toEqual({ page: "profile" });
  });

  it("parses /studio route", () => {
    window.history.replaceState(null, "", "/studio");
    expect(parseRouteFromLocation()).toEqual({ page: "studio" });
  });

  it("parses /following route", () => {
    window.history.replaceState(null, "", "/following");
    expect(parseRouteFromLocation()).toEqual({ page: "following" });
  });

  it("parses root / as home route", () => {
    window.history.replaceState(null, "", "/");
    expect(parseRouteFromLocation()).toEqual({ page: "home" });
  });
});

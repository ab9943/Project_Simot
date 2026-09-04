// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "./page";

afterEach(() => {
  cleanup();
});

describe("Home", () => {
  it("renders the system title", () => {
    render(<Home />);
    expect(screen.getByText("영업 일일 보고 시스템")).toBeInTheDocument();
  });
});

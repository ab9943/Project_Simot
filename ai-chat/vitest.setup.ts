import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement Element.scrollTo — ChatApp calls it to keep the
// message list scrolled to the bottom as new messages arrive.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

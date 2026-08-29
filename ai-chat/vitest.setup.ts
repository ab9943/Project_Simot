import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement Element.scrollTo — ChatApp calls it to keep the
// message list scrolled to the bottom as new messages arrive.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom doesn't implement createObjectURL/revokeObjectURL — ChatApp uses
// these to preview attached images before they're sent.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:mock-url";
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}

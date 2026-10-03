import Prism from "prismjs";

// Prism's language component files (prism-python, prism-markdown, ...)
// reference a bare global `Prism`. Under a bundler the UMD core only fills
// module.exports and never touches window, so the components would throw
// "Prism is not defined" and take the whole page down. Expose the core on
// globalThis here — this module MUST be imported before any component.
(globalThis as unknown as { Prism: typeof Prism }).Prism = Prism;

// We highlight explicitly via highlightElement(); skip Prism's own
// DOMContentLoaded auto-scan.
Prism.manual = true;

export default Prism;

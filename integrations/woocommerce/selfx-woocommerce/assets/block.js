/* global window */
(function (blocks, element) {
  blocks.registerBlockType("selfx/try-on", {
    apiVersion: 3,
    title: "SelfX Try-On",
    icon: "camera",
    category: "widgets",
    description:
      "Show Try-On for the eligible product in this product template.",
    usesContext: ["postId"],
    edit: function () {
      return element.createElement(
        "p",
        {},
        "SelfX Try-On — shown for eligible connected products.",
      );
    },
    save: function () {
      return null;
    },
  });
})(window.wp.blocks, window.wp.element);

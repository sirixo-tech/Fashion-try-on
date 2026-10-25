/* global window */
(function (blocks, element, blockEditor, components, i18n) {
  const el = element.createElement;
  const defaultLabel = i18n.__("Try it on", "selfx-woocommerce");

  // Server-registered block.json supplies attributes and native style supports.
  blocks.registerBlockType("selfx/try-on", {
    edit: function ({ attributes, setAttributes }) {
      const blockProps = blockEditor.useBlockProps({
        className: "button wp-element-button",
        type: "button",
        onClick: function (event) {
          event.preventDefault();
        },
      });

      return el(
        element.Fragment,
        null,
        el(
          blockEditor.InspectorControls,
          null,
          el(
            components.PanelBody,
            { title: i18n.__("Try-On button", "selfx-woocommerce") },
            el(components.TextControl, {
              label: i18n.__("Button text", "selfx-woocommerce"),
              value:
                attributes.label === undefined
                  ? defaultLabel
                  : attributes.label,
              placeholder: defaultLabel,
              onChange: function (label) {
                setAttributes({ label });
              },
              help: i18n.__(
                "Shown only for eligible connected products. Use the Styles tab to customize its appearance.",
                "selfx-woocommerce",
              ),
            }),
          ),
        ),
        el(
          "button",
          blockProps,
          (attributes.label || "").trim() || defaultLabel,
        ),
      );
    },
    save: function () {
      return null;
    },
  });
})(
  window.wp.blocks,
  window.wp.element,
  window.wp.blockEditor,
  window.wp.components,
  window.wp.i18n,
);

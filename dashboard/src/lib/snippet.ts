export const WIDGET_SRC = "https://app.brainbox.sh/widget.js";

/** A button the customer puts anywhere in their app; a click opens the
 *  widget's feature-request form. Needs the install tag on the page. */
export const FEATURE_BUTTON_SNIPPET = `<button data-brainbox="feature">Request a feature</button>`;

/** The one-line install tag a customer pastes before `</body>`. */
export function snippetFor(projectKey: string, endpoint: string): string {
  return `<script src="${WIDGET_SRC}" data-project="${projectKey}" data-endpoint="${endpoint}"></script>`;
}

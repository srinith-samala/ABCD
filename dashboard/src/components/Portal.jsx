import { createPortal } from 'react-dom';

// Renders its children straight into <body>. Modals and drawers use this so they are always positioned
// against the screen, no matter which page wrapper (animation, transform, overflow) they are written inside.
export default function Portal({ children }) {
  return createPortal(children, document.body);
}

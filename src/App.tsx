/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import ImageEditor from './components/ImageEditor';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <ImageEditor />
    </ErrorBoundary>
  );
}


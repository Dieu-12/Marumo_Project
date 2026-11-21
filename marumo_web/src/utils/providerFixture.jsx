import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppProvider, useApp } from '../context/AppContext.jsx';

export function readProviderSnapshot() {
  let current;
  function Probe() {
    current = useApp();
    return null;
  }
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AppProvider, null, createElement(Probe))));
  return current;
}
import { createElement } from 'react';

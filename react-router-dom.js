/* eslint-disable */
/* MIT License

Copyright (c) React Training LLC 2015-2019
Copyright (c) Remix Software Inc. 2020-2021
Copyright (c) Shopify Inc. 2022-2023

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. */
import React, { startTransition, useCallback, useLayoutEffect, useRef, useState } from 'react';

const DataRouterContext = React.createContext(null);
const NavigationContext = React.createContext({ basename: null, navigator: {}, static: false });
const RouteContext = React.createContext({ outlet: null, matches: [], isDataRoute: false });
const LocationContext = React.createContext({ location: { state: null, key: null }, navigationType: 'REPLACE' });

function useIsomorphicLayoutEffect(cb) {
  const isStatic = React.useContext(NavigationContext).static;
  if (!isStatic) {
    React.useLayoutEffect(cb);
  }
}

function invariant(value, message) {
  if (value === false || value === null || typeof value === 'undefined') {
    throw new Error(message);
  }
}

function Route() {
  invariant(false, `A <Route> is only ever to be used as the child of <Routes> element, ` + `never rendered directly. Please wrap your <Route> in a <Routes>.`);
}

function Router({ basename: basenameProp = '/', children = null, location: locationProp, navigationType = NavigationType.Pop, navigator, static: staticProp = false }) {
  const basename = basenameProp.replace(/^\/*/, '/');
  const navigationContext = React.useMemo(() => ({ basename, navigator, static: staticProp }), [basename, navigator, staticProp]);
  if (typeof locationProp === 'string') {
    locationProp = parsePath(locationProp);
  }
  const { pathname = '/', search = '', hash = '', state = null, key = 'default' } = locationProp;
  const locationContext = React.useMemo(() => {
    const trailingPathname = stripBasename(pathname, basename);
    if (trailingPathname == null) {
      return null;
    }
    return { location: { pathname: trailingPathname, search, hash, state, key }, navigationType };
  }, [basename, pathname, search, hash, state, key, navigationType]);
  if (locationContext == null) {
    return null;
  }
  return (
    <NavigationContext.Provider value={navigationContext}>
      <LocationContext.Provider children={children} value={locationContext} />
    </NavigationContext.Provider>
  );
}

function Navigate({ to, replace, state, relative }) {
  const { matches } = React.useContext(RouteContext);
  const { pathname: locationPathname } = useLocation();
  const navigate = useNavigate();
  const path = resolveTo(to, getPathContributingMatches(matches).map((match) => match.pathnameBase), locationPathname, relative === 'path');
  const jsonPath = JSON.stringify(path);
  React.useEffect(() => navigate(JSON.parse(jsonPath), { replace, state, relative }), [navigate, jsonPath, relative, replace, state]);
  return null;
}

function createRoutesFromChildren(children, parentPath = []) {
  const routes = [];
  React.Children.forEach(children, (element, index) => {
    if (!React.isValidElement(element)) {
      return;
    }
    const treePath = [...parentPath, index];
    if (element.type === React.Fragment) {
      return routes.push.apply(routes, createRoutesFromChildren(element.props.children, treePath));
    }
    let route = {
      id: element.props.id || treePath.join('-'),
      caseSensitive: element.props.caseSensitive,
      element: element.props.element,
      Component: element.props.Component,
      index: element.props.index,
      path: element.props.path,
      loader: element.props.loader,
      action: element.props.action,
      errorElement: element.props.errorElement,
      ErrorBoundary: element.props.ErrorBoundary,
      hasErrorBoundary: element.props.ErrorBoundary != null || element.props.errorElement != null,
      shouldRevalidate: element.props.shouldRevalidate,
      handle: element.props.handle,
      lazy: element.props.lazy,
    };
    if (element.props.children) {
      route.children = createRoutesFromChildren(element.props.children, treePath);
    }
    routes.push(route);
  });
  return routes;
}

function useRoutes(routes, locationArg) {
  return useRoutesImpl(routes, locationArg);
}

function RenderedRoute({ routeContext, match, children }) {
  let dataRouterContext = React.useContext(DataRouterContext);
  if (dataRouterContext && dataRouterContext.static && dataRouterContext.staticContext && (match.route.errorElement || match.route.ErrorBoundary)) {
    dataRouterContext.staticContext._deepestRenderedBoundaryId = match.route.id;
  }
  return (<RouteContext.Provider value={routeContext}>{children}</RouteContext.Provider>);
}

function _renderMatches(matches, parentMatches = [], dataRouterState = null) {
  if (matches == null) {
    if (dataRouterState?.errors) {
      matches = dataRouterState.matches;
    } else {
      return null;
    }
  }
  let renderedMatches = matches;
  const errors = dataRouterState?.errors;
  if (errors != null) {
    let errorIndex = renderedMatches.findIndex((m) => m.route.id && errors?.[m.route.id]);
    renderedMatches = renderedMatches.slice(0, Math.min(renderedMatches.length, errorIndex + 1));
  }
  return renderedMatches.reduceRight((outlet, match, index) => {
    const error = match.route.id ? errors?.[match.route.id] : null;
    let errorElement = null;
    if (dataRouterState) {
      errorElement = match.route.errorElement || defaultErrorElement;
    }
    const matches = parentMatches.concat(renderedMatches.slice(0, index + 1));
    let getChildren = () => {
      let children;
      if (error) {
        children = errorElement;
      } else if (match.route.Component) {
        children = <match.route.Component />;
      } else if (match.route.element) {
        children = match.route.element;
      } else {
        children = outlet;
      }
      return (<RenderedRoute match={match} routeContext={{ outlet, matches, isDataRoute: dataRouterState != null }} children={children} />);
    };
    return dataRouterState && (match.route.ErrorBoundary || match.route.errorElement || index === 0) ? null : (getChildren());
  }, null);
}

function stripBasename(pathname, basename) {
  if (basename === '/') {
    return pathname;
  }
  if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) {
    return null;
  }
  const startIndex = basename.endsWith('/') ? basename.length - 1 : basename.length;
  const nextChar = pathname.charAt(startIndex);
  if (nextChar && nextChar !== '/') {
    return null;
  }
  return pathname.slice(startIndex) || '/';
}

const paramRe = /^:\w+$/;
const dynamicSegmentValue = 3;
const indexRouteValue = 2;
const emptySegmentValue = 1;
const staticSegmentValue = 10;
const splatPenalty = -2;
const isSplat = (s) => s === '*';

function computeScore(path, index) {
  let segments = path.split('/');
  let initialScore = segments.length;
  if (segments.some(isSplat)) {
    initialScore += splatPenalty;
  }
  if (index) {
    initialScore += indexRouteValue;
  }
  return segments.filter((s) => !isSplat(s)).reduce((score, segment) => score + (paramRe.test(segment) ? dynamicSegmentValue : segment === '' ? emptySegmentValue : staticSegmentValue), initialScore);
}

function explodeOptionalSegments(path) {
  let segments = path.split('/');
  if (segments.length === 0) {
    return [];
  }
  let [first, ...rest] = segments;
  const isOptional = first.endsWith('?');
  const required = first.replace(/\?$/, '');
  if (rest.length === 0) {
    return isOptional ? [required, ''] : [required];
  }
  const restExploded = explodeOptionalSegments(rest.join('/'));
  const result = [];
  result.push(...restExploded.map((subpath) => subpath === '' ? required : [required, subpath].join('/')));
  if (isOptional) {
    result.push(...restExploded);
  }
  return result.map((exploded) => path.startsWith('/') && exploded === '' ? '/' : exploded);
}

function flattenRoutes(routes, branches = [], parentsMeta = [], parentPath = '') {
  const flattenRoute = (route, index, relativePath) => {
    const meta = {
      relativePath: relativePath === undefined ? route.path || '' : relativePath,
      caseSensitive: route.caseSensitive === true,
      childrenIndex: index,
      route,
    };
    if (meta.relativePath.startsWith('/')) {
      meta.relativePath = meta.relativePath.slice(parentPath.length);
    }
    const path = joinPaths([parentPath, meta.relativePath]);
    const routesMeta = parentsMeta.concat(meta);
    if (route.children && route.children.length > 0) {
      flattenRoutes(route.children, branches, routesMeta, path);
    }
    if (route.path == null && !route.index) {
      return;
    }
    branches.push({ path, score: computeScore(path, route.index), routesMeta });
  };
  routes.forEach((route, index) => {
    if (route.path === '' || !route.path?.includes('?')) {
      flattenRoute(route, index);
    } else {
      for (let exploded of explodeOptionalSegments(route.path)) {
        flattenRoute(route, index, exploded);
      }
    }
  });
  return branches;
}

function compareIndexes(a, b) {
  const siblings = a.length === b.length && a.slice(0, -1).every((n, i) => n === b[i]);
  return siblings ? a[a.length - 1] - b[b.length - 1] : 0;
}

function rankRouteBranches(branches) {
  branches.sort((a, b) => a.score !== b.score ? b.score - a.score : compareIndexes(a.routesMeta.map((meta) => meta.childrenIndex), b.routesMeta.map((meta) => meta.childrenIndex)));
}

function compilePath(path, caseSensitive = false, end = true) {
  const paramNames = [];
  let regexpSource = '^' + path.replace(/\/*\*?$/, '').replace(/^\/*/, '/').replace(/[\\.*+^$?{}|()[\]]/g, '\\$&').replace(/\/:(\w+)/g, (_, paramName) => {
    paramNames.push(paramName);
    return '/([^\\/]+)';
  });
  if (path.endsWith('*')) {
    paramNames.push('*');
    regexpSource += path === '*' || path === '/*' ? '(.*)$' : '(?:\\/(.+)|\\/*)$';
  } else if (end) {
    regexpSource += '\\/*$';
  } else if (path !== '' && path !== '/') {
    regexpSource += '(?:(?=\\/|$))';
  } else {
    // Nothing to match for '' or '/'
  }
  const matcher = new RegExp(regexpSource, caseSensitive ? undefined : 'i');
  return [matcher, paramNames];
}

function safelyDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function matchPath(pattern, pathname) {
  if (typeof pattern === 'string') {
    pattern = { path: pattern, caseSensitive: false, end: true };
  }
  const [matcher, paramNames] = compilePath(pattern.path, pattern.caseSensitive, pattern.end);
  const match = pathname.match(matcher);
  if (!match) {
    return null;
  }
  const matchedPathname = match[0];
  let pathnameBase = matchedPathname.replace(/(.)\/+$/, '$1');
  const captureGroups = match.slice(1);
  const params = paramNames.reduce((memo, paramName, index) => {
    if (paramName === '*') {
      const splatValue = captureGroups[index] || '';
      pathnameBase = matchedPathname.slice(0, matchedPathname.length - splatValue.length).replace(/(.)\/+$/, '$1');
    }
    memo[paramName] = safelyDecodeURIComponent(captureGroups[index] || '', paramName);
    return memo;
  }, {});
  return { params, pathname: matchedPathname, pathnameBase, pattern };
}

function matchRouteBranch(branch, pathname) {
  let { routesMeta } = branch;
  let matchedParams = {};
  let matchedPathname = '/';
  const matches = [];
  for (let i = 0; i < routesMeta.length; ++i) {
    const meta = routesMeta[i];
    const end = i === routesMeta.length - 1;
    const remainingPathname = matchedPathname === '/' ? pathname : pathname.slice(matchedPathname.length) || '/';
    const match = matchPath({ path: meta.relativePath, caseSensitive: meta.caseSensitive, end }, remainingPathname);
    if (!match) {
      return null;
    }
    Object.assign(matchedParams, match.params);
    const route = meta.route;
    matches.push({ params: matchedParams, pathname: joinPaths([matchedPathname, match.pathname]), pathnameBase: normalizePathname(joinPaths([matchedPathname, match.pathnameBase])), route });
    if (match.pathnameBase !== '/') {
      matchedPathname = joinPaths([matchedPathname, match.pathnameBase]);
    }
  }
  return matches;
}

function safelyDecodeURI(value) {
  try {
    return decodeURI(value);
  } catch (error) {
    return value;
  }
}

function matchRoutes(routes, locationArg, basename = '/') {
  const location = typeof locationArg === 'string' ? parsePath(locationArg) : locationArg;
  const pathname = stripBasename(location.pathname || '/', basename);
  if (pathname == null) {
    return null;
  }
  const branches = flattenRoutes(routes);
  rankRouteBranches(branches);
  let matches = null;
  for (let i = 0; matches == null && i < branches.length; ++i) {
    matches = matchRouteBranch(branches[i], safelyDecodeURI(pathname));
  }
  return matches;
}

function useLocation() {
  return React.useContext(LocationContext).location;
}

function useRoutesImpl(routes, locationArg, dataRouterState) {
  const { navigator } = React.useContext(NavigationContext);
  const { matches: parentMatches } = React.useContext(RouteContext);
  const routeMatch = parentMatches[parentMatches.length - 1];
  const parentParams = routeMatch ? routeMatch.params : {};
  const parentPathnameBase = routeMatch ? routeMatch.pathnameBase : '/';
  const locationFromContext = useLocation();
  let location;
  if (locationArg) {
    let parsedLocationArg = typeof locationArg === 'string' ? parsePath(locationArg) : locationArg;
    location = parsedLocationArg;
  } else {
    location = locationFromContext;
  }
  const pathname = location.pathname || '/';
  const remainingPathname = parentPathnameBase === '/' ? pathname : pathname.slice(parentPathnameBase.length) || '/';
  const matches = matchRoutes(routes, { pathname: remainingPathname });
  const renderedMatches = _renderMatches(matches && matches.map((match) =>
    Object.assign({}, match, {
      params: Object.assign({}, parentParams, match.params),
      pathname: joinPaths([parentPathnameBase, navigator.encodeLocation ? navigator.encodeLocation(match.pathname).pathname : match.pathname,]),
      pathnameBase: match.pathnameBase === '/' ? parentPathnameBase : joinPaths([parentPathnameBase, navigator.encodeLocation ? navigator.encodeLocation(match.pathnameBase).pathname : match.pathnameBase,]),
    })
  ), parentMatches, dataRouterState);
  if (locationArg && renderedMatches) {
    return (
      <LocationContext.Provider value={{ location: { pathname: '/', hash: '', state: null, key: 'default', ...location, }, navigationType: NavigationType.Pop }}>
        {renderedMatches}
      </LocationContext.Provider>
    );
  }
  return renderedMatches;
}

function Routes({ children, location }) {
  return useRoutes(createRoutesFromChildren(children), location);
}

function useParams() {
  let { matches } = React.useContext(RouteContext);
  let routeMatch = matches[matches.length - 1];
  return routeMatch ? routeMatch.params : {};
}

function useNavigate() {
  const { isDataRoute } = React.useContext(RouteContext);
  return isDataRoute ? useNavigateStable() : useNavigateUnstable();
}

function getPathContributingMatches(matches) {
  return matches.filter((match, index) => index === 0 || (match.route.path && match.route.path.length > 0));
}

const joinPaths = (paths) => paths.join('/').replace(/\/\/+/g, '/');
const normalizePathname = (pathname) => pathname.replace(/\/+$/, '').replace(/^\/*/, '/');

function useNavigateUnstable() {
  let dataRouterContext = React.useContext(DataRouterContext);
  const { basename, navigator } = React.useContext(NavigationContext);
  const { matches } = React.useContext(RouteContext);
  const { pathname: locationPathname } = useLocation();
  const routePathnamesJson = JSON.stringify(getPathContributingMatches(matches).map((match) => match.pathnameBase));
  let activeRef = React.useRef(false);
  useIsomorphicLayoutEffect(() => {
    activeRef.current = true;
  });
  const navigate = React.useCallback((to, options = {}) => {
    if (!activeRef.current) {
      return;
    }
    if (typeof to === 'number') {
      return navigator.go(to);
    }
    let path = resolveTo(to, JSON.parse(routePathnamesJson), locationPathname, options.relative === 'path');
    if (dataRouterContext == null && basename !== '/') {
      path.pathname = path.pathname === '/' ? basename : joinPaths([basename, path.pathname]);
    }
    (!!options.replace ? navigator.replace : navigator.push)(path, options.state, options);
  }, [basename, navigator, routePathnamesJson, locationPathname, dataRouterContext]);
  return navigate;
}

const normalizeSearch = (search) => !search || search === '?' ? '' : search.startsWith('?') ? search : '?' + search;
const normalizeHash = (hash) => !hash || hash === '#' ? '' : hash.startsWith('#') ? hash : '#' + hash;

function resolvePath(to, fromPathname = '/') {
  let { pathname: toPathname, search = '', hash = '' } = typeof to === 'string' ? parsePath(to) : to;
  let pathname = toPathname ? toPathname.startsWith('/') ? toPathname : resolvePathname(toPathname, fromPathname) : fromPathname;
  return { pathname, search: normalizeSearch(search), hash: normalizeHash(hash) };
}

function resolvePathname(relativePath, fromPathname) {
  let segments = fromPathname.replace(/\/+$/, '').split('/');
  let relativeSegments = relativePath.split('/');
  relativeSegments.forEach((segment) => {
    if (segment === '..') {
      if (segments.length > 1) {
        segments.pop();
      }
    } else if (segment !== '.') {
      segments.push(segment);
    }
  });
  return segments.length > 1 ? segments.join('/') : '/';
}

function resolveTo(toArg, routePathnames, locationPathname, isPathRelative = false) {
  let to;
  if (typeof toArg === 'string') {
    to = parsePath(toArg);
  } else {
    to = { ...toArg };
  }
  const isEmptyPath = toArg === '' || to.pathname === '';
  const toPathname = isEmptyPath ? '/' : to.pathname;
  let from;
  if (isPathRelative || toPathname == null) {
    from = locationPathname;
  } else {
    let routePathnameIndex = routePathnames.length - 1;
    if (toPathname.startsWith('..')) {
      let toSegments = toPathname.split('/');
      while (toSegments[0] === '..') {
        toSegments.shift();
        routePathnameIndex -= 1;
      }
      to.pathname = toSegments.join('/');
    }
    from = routePathnameIndex >= 0 ? routePathnames[routePathnameIndex] : '/';
  }
  let path = resolvePath(to, from);
  const hasExplicitTrailingSlash = toPathname && toPathname !== '/' && toPathname.endsWith('/');
  const hasCurrentTrailingSlash = (isEmptyPath || toPathname === '.') && locationPathname.endsWith('/');
  if (!path.pathname.endsWith('/') && (hasExplicitTrailingSlash || hasCurrentTrailingSlash)) {
    path.pathname += '/';
  }
  return path;
}

function useNavigateStable() {
  let ctx = React.useContext(DataRouterContext);
  let { router } = ctx;
  const route = React.useContext(RouteContext);
  const thisRoute = route.matches[route.matches.length - 1];
  const id = thisRoute.route.id;
  let activeRef = React.useRef(false);
  useIsomorphicLayoutEffect(() => {
    activeRef.current = true;
  });
  const navigate = React.useCallback((to, options = {}) => {
    if (!activeRef.current) {
      return;
    }
    if (typeof to === 'number') {
      router.navigate(to);
    } else {
      router.navigate(to, { fromRouteId: id, ...options });
    }
  }, [router, id]);
  return navigate;
}

const createPath = ({ pathname = '/', search = '', hash = '' }) => {
  if (search && search !== '?') {
    pathname += search.charAt(0) === '?' ? search : '?' + search;
  }
  if (hash && hash !== '#') {
    pathname += hash.charAt(0) === '#' ? hash : '#' + hash;
  }
  return pathname;
};

const parsePath = (path) => {
  let parsedPath = {};
  if (path) {
    const hashIndex = path.indexOf('#');
    if (hashIndex >= 0) {
      parsedPath.hash = path.substr(hashIndex);
      path = path.substr(0, hashIndex);
    }
    const searchIndex = path.indexOf('?');
    if (searchIndex >= 0) {
      parsedPath.search = path.substr(searchIndex);
      path = path.substr(0, searchIndex);
    }
    if (path) {
      parsedPath.pathname = path;
    }
  }
  return parsedPath;
};

const createLocation = (current, to, state = null, key) => {
  const toKey = typeof to !== 'string' && to && to.key;
  key = toKey || key || Math.random().toString(36).substring(2, 10);
  const location = {
    pathname: typeof current === 'string' ? current : current.pathname,
    search: '',
    hash: '',
    ...(typeof to === 'string' ? parsePath(to) : to),
    state,
    key: key,
  };
  return location;
};

const BrowserRouter = ({ basename, children, window }) => {
  const historyRef = useRef();
  if (historyRef.current == null) {
    historyRef.current = getUrlBasedHistory({ window });
  }
  const history = historyRef.current;
  const [state, setStateImpl] = useState({ action: history.action, location: history.location });
  const setState = useCallback((newState) => startTransition(() => setStateImpl(newState)), [setStateImpl]);
  useLayoutEffect(() => history.listen(setState), [history, setState]);
  return (<Router basename={basename} children={children} location={state.location} navigationType={state.action} navigator={history} />);
}

const HashRouter = ({ basename, children, window }) => {
  const historyRef = useRef();
  if (historyRef.current == null) {
    historyRef.current = getUrlBasedHistory({ window });
  }
  const history = historyRef.current;
  const [state, setStateImpl] = useState({ action: history.action, location: history.location });
  const setState = useCallback((newState) => startTransition(() => setStateImpl(newState)), [setStateImpl]);
  useLayoutEffect(() => history.listen(setState), [history, setState]);
  return (<Router basename={basename} children={children} location={state.location} navigationType={state.action} navigator={history} />);
};

const HistoryRouter = ({ basename, children, history }) => {
  const [state, setStateImpl] = useState({ action: history.action, location: history.location });
  const setState = useCallback((newState) => startTransition(() => setStateImpl(newState)), [setStateImpl]);
  useLayoutEffect(() => history.listen(setState), [history, setState]);
  return (<Router basename={basename} children={children} location={state.location} navigationType={state.action} navigator={history} />);
};

const getUrlBasedHistory = (options = {}) => {
  const { window = document.defaultView } = options;
  const globalHistory = window.history;
  let action = 'POP';
  let listener = null;
  let index = getIndex();
  if (index === null) {
    index = 0;
    globalHistory.replaceState({ ...globalHistory.state, idx: index }, '');
  }

  function getIndex() {
    const state = globalHistory.state || { idx: null };
    return state.idx;
  }

  function handlePop() {
    action = 'POP';
    const nextIndex = getIndex();
    const delta = nextIndex == null ? null : nextIndex - index;
    index = nextIndex;
    if (listener) {
      listener({ action, location: history.location, delta });
    }
  }

  function push(to, state) {
    action = 'PUSH';
    const location = createLocation(history.location, to, state);
    index = getIndex() + 1;
    const historyState = { usr: location.state, key: location.key, idx: index };
    const url = history.createHref(location);
    if (index < 100) {
      globalHistory.pushState(historyState, '', url);
    } else {
      window.location.assign(url);
    }
    if (listener) {
      listener({ action, location: history.location, delta: 1 });
    }
  }

  function replace(to, state) {
    action = 'REPLACE';
    const location = createLocation(history.location, to, state);
    index = getIndex();
    const historyState = { usr: location.state, key: location.key, idx: index };
    const url = history.createHref(location);
    globalHistory.replaceState(historyState, '', url);
    if (listener) {
      listener({ action, location: history.location, delta: 0 });
    }
  }

  function createURL(to) {
    const base = window.location.origin !== 'null' ? window.location.origin : window.location.href;
    const href = typeof to === 'string' ? to : createPath(to);
    return new URL(href, base);
  }

  let history = {
    get action() {
      return action;
    },
    get location() {
      const { pathname, search, hash } = window.location;
      return createLocation('', { pathname, search, hash }, (globalHistory.state && globalHistory.state.usr) || null, (globalHistory.state && globalHistory.state.key) || 'default');
    },
    listen(fn) {
      if (listener) {
        throw new Error('A history only accepts one active listener');
      }
      window.addEventListener('popstate', handlePop);
      listener = fn;
      return () => {
        window.removeEventListener('popstate', handlePop);
        listener = null;
      };
    },
    createHref(to) {
      return typeof to === '' ? to : createPath(to);
    },
    createURL,
    encodeLocation(to) {
      const url = createURL(to);
      return { pathname: url.pathname, search: url.search, hash: url.hash };
    },
    push,
    replace,
    go(n) {
      return globalHistory.go(n);
    },
  };
  return history;
};

export { BrowserRouter, HashRouter, HistoryRouter, Navigate, Route, Routes, useNavigate, useParams };
export default { BrowserRouter, HashRouter, HistoryRouter, Navigate, Route, Routes, useNavigate, useParams };

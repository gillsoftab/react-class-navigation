import React, { Component } from 'react';
import { BrowserRouter, Route, Routes } from './react-router-dom';
import loadable from '@loadable/component';

const AboutPage = loadable(() => import(/* webpackChunkName: "about" */'./about'));
const NotFoundPage = loadable(() => import(/* webpackChunkName: "notfound" */'./notfound'));

class App extends Component {

  constructor(props) {
    super(props);
    this.state = {
      loading: true
    };
  }

  componentDidMount() {
    
  }

  componentWillUnmount() {
    
  }

  render() {
    return (
      <BrowserRouter>
        <Routes>
          <Route key={1} end={true} path={`/`} element={<AboutPage />} />
          <Route key={2} end={false} path={`*`} element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    );
  }
}

export default App;
export const app = new App();

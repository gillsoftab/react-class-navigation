import React, { Component } from 'react';
import PropTypes from 'prop-types';
import withRouter from './withRouter';

class NotFoundPage extends Component {

  constructor(props) {
    super(props);
    this.state = {
      loading: false
    };
  }

  navigateTo(to = '/') {
    this.props.navigate(to, { replace: true });
  }

  componentDidMount() {
    queueMicrotask(() => console.log('componentDidMount params:', this.props.params));
  }

  componentWillUnmount() {
    
  }

  render() {
    const { loading } = this.state;
    const title = 'I am a title';
    const text = 'Oops page not found!';
    return (
      <div>
        <div style={{ textAlign: 'center' }}>{title}</div>
        <div style={{ textAlign: 'center' }}>{text}</div>
      </div>
    );
  }
}

NotFoundPage.propTypes = {
  navigate: PropTypes.func,
  params: PropTypes.object
};

export default withRouter(NotFoundPage);

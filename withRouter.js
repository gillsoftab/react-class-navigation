/* eslint-disable react/display-name */
import React from 'react';
import { useNavigate, useParams } from './react-router-dom';

const withRouter = (Component) => (props) => {
  const navigate = useNavigate();
  const params = useParams();
  return (<Component {...props} {...{ navigate, params }} />);
};

export default withRouter;

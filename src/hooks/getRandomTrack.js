import { useEffect, useState } from 'react';
import { makeRequest } from '../makeRequest';

const getRandomTrack = () => {

  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    
  }, []);


  return { data, error };
};

export default getRandomTrack;

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { makeRequest } from '../makeRequest';

function Welcome() {
  const storedUserName = localStorage.getItem('username');
  const [playerName, setPlayerName] = useState(storedUserName || "");
  const [loading, setLoading] = useState(!storedUserName);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await makeRequest.get(`me`);
        const newPlayerName = response.data.display_name;
        setPlayerName(newPlayerName);
        localStorage.setItem('username', newPlayerName);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    if (!storedUserName || storedUserName === '') {
      fetchData();
    }
  }, [storedUserName]);

  return (
    <div className='playerName'>
      {loading ? (
        <p>Loading...</p>
      ) : playerName ? (
        <>
          <h1>Hey, {playerName}👋</h1>
          <Link to="/search">Start Playin'</Link>
        </>
      ) : (
        <p>Error loading player name.</p>
      )}
    </div>
  );
}

export default Welcome;

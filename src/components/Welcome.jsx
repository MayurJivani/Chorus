import React, { useState, useEffect } from 'react';
import useFetch from '../hooks/useFetch';
import { Link } from 'react-router-dom';

function Welcome() {
  const [playerName, setPlayerName] = useState("");
  const { data: userData, loading, error } = useFetch(`me`);

  useEffect(() => {
    // Check if userData is available before updating the playerName
    if (userData && userData.display_name) {
      setPlayerName(userData.display_name);
    }
  }, [userData]);

  return (
    <>
      {loading && <p>Loading...</p>}
      
    
        <div className='playerName'>
          <h1>Hey, {playerName}👋</h1>
          
        </div>
    
    </>
  );
}

export default Welcome;

// Welcome.jsx
import React, { useState, useEffect } from 'react';
import { makeRequest } from '../makeRequest';
function Welcome() {
  
  const [playerName, setPlayerName] = useState("");
  const fetchData = async () => {
    const response = await makeRequest.get('me');
    setPlayerName(response.data.display_name)
  }
    fetchData();


  return (
    <>
     
        <div className='playerName'>
          <h1>Hey, {playerName}👋</h1>
        </div>
      
    </>
  );
}

export default Welcome;

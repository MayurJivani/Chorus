import { useEffect, useState } from 'react';
import { makeRequest } from '../makeRequest';

const getRandomTrack = (artistId) => {

    const { data: albums, loading: albumsLoading, error: albumsError } = useFetch(
        `/artists/${artistId}/albums?include_groups=album%2Csingle`,
        !storedAlbums
      );
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (albums) {
        const filteredAlbums = albums.items.filter(album => !hasFilteredTerm(album.name));
        setAlbumsData(filteredAlbums);
  
        // Make a request for album details using album IDs
        const albumIds = filteredAlbums.map(album => album.id).join(',');
        const fetchAlbumDetails = async () => {
          try {
            const response = await makeRequest.get(`albums?ids=${albumIds}`);
            // Process the response for album details
            console.log('Album details:', response.data.albums);
  
            // Extract and filter tracks from the response
            const allTracks = response.data.albums
              .map(album => album.tracks.items)
              .flat()
              .filter(track => !hasFilteredTerm(track.name));
  
            
  
            // Store albums and tracks in local storage
            localStorage.setItem('albums', JSON.stringify(filteredAlbums));
            localStorage.setItem('tracks', JSON.stringify(allTracks));
          } catch (error) {
            console.error('Error fetching album details:', error);
          }
        };
  
        fetchAlbumDetails();
      }
  }, [albums]);

  const hasFilteredTerm = (str) => {
    const termsToFilter = ['remix', 'acoustic', 'instrumental', 'mix'];
    return termsToFilter.some(term => str.toLowerCase().includes(term));
  };


  return { data, error };
};

export default getRandomTrack;

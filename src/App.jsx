import { createBrowserRouter,RouterProvider } from 'react-router-dom';
import './App.css'
import LandingPage from './LandingPage';
import { Play, Search, Welcome } from './components';

function App() {

  
  const router = createBrowserRouter([
    
    {
      path:"/",
      element:<LandingPage/>
    },
    {
      path:"/search/",
      element:<Search/>
    },
    {
      path:"/welcome/",
      element:<Welcome/>
    },
    {
      path:"/play/",
      element:<Play/>
    },
    

  ])

  return (
    <>
      <RouterProvider router={router}/>
    </>
  )
}

export default App

<?php

// autoload_static.php @generated by Composer

namespace Composer\Autoload;

class ComposerStaticInit42422d57a81bcb40a1a3ab7a0c805da9
{
    public static $prefixLengthsPsr4 = array (
        'S' => 
        array (
            'SpotifyWebAPI\\' => 14,
        ),
    );

    public static $prefixDirsPsr4 = array (
        'SpotifyWebAPI\\' => 
        array (
            0 => __DIR__ . '/..' . '/jwilsson/spotify-web-api-php/src',
        ),
    );

    public static $classMap = array (
        'Composer\\InstalledVersions' => __DIR__ . '/..' . '/composer/InstalledVersions.php',
    );

    public static function getInitializer(ClassLoader $loader)
    {
        return \Closure::bind(function () use ($loader) {
            $loader->prefixLengthsPsr4 = ComposerStaticInit42422d57a81bcb40a1a3ab7a0c805da9::$prefixLengthsPsr4;
            $loader->prefixDirsPsr4 = ComposerStaticInit42422d57a81bcb40a1a3ab7a0c805da9::$prefixDirsPsr4;
            $loader->classMap = ComposerStaticInit42422d57a81bcb40a1a3ab7a0c805da9::$classMap;

        }, null, ClassLoader::class);
    }
}

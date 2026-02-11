const builder = require('electron-builder');
const { productname } = require('./package.json');

builder.build({
    config: {
        publish: [
            {
                provider: "github",
                owner: "1ly4s0",
                repo: "battly4hytale",
                releaseType: "release"
            }
        ],
        generateUpdatesFilesForAllChannels: true,
        appId: productname,
        productName: productname,
        artifactName: '${productName}-${os}-${arch}.${ext}',
        files: ["src/**/*", "package.json", "LICENSE.md", "README.md", "CONTRIBUTING.md", "jre.json", "config.json"],
        directories: { "output": "dist" },
        compression: 'maximum',
        asar: true,
        mac: {
            icon: "src/assets/images/logo/256x256.icns",
            category: "public.app-category.games",
            target: [{
                target: "dmg",
                arch: ["x64", "arm64"]
            }]
        },
        linux: {
            icon: "src/assets/images/logo/256x256.png",
            target: [
                {
                    target: "AppImage",
                    arch: ["x64"]
                },
                {
                    target: "tar.gz",
                    arch: ["x64"]
                },
                {
                    target: "deb",
                    arch: ["x64"]
                },
                {
                    target: "rpm",
                    arch: ["x64"]
                },
            ]
        }
    }
}).then(() => {
    console.log('✅ El build se ha realizado correctamente.')
}).catch(err => {
    console.error('Error al realizar el build', err)
});
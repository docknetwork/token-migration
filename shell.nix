let
  pkgs = import <nixpkgs> {};
in
pkgs.stdenv.mkDerivation {
  name = "my-env";

  buildInputs =
    [
      pkgs.nodejs
      pkgs.yarn
    ];
}

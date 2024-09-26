(ns cryogen.core
  (:require 
   [cryogen-core.compiler :refer [compile-assets-timed]]
   [cryogen-core.plugins :refer [load-plugins]]
   [asset-minifier.core :refer [minify-css]]))

(defn -main []
  (load-plugins)
  (compile-assets-timed)
  (minify-css "themes/nucleus/css" "themes/nucleus/css/site.css")
  (System/exit 0))
